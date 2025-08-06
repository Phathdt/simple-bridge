// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract SimpleBridge is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable weth;
    uint256 public numberOfDeposits;

    // State mappings
    mapping(uint256 => mapping(address => mapping(address => bool))) public enabledDepositRoutes;
    mapping(bytes32 => bool) public filledRelays;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public minDeposit;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public maxDeposit;

    // Additional mappings for spokepool compatibility
    mapping(bytes32 => FillStatus) public relayFillStatuses;
    mapping(bytes32 => uint256) public relayerRefunds;

    // Events - Matching Across Protocol exactly
    event FundsDeposited(
        bytes32 inputToken,
        bytes32 outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 indexed destinationChainId,
        uint256 indexed depositId,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes32 indexed depositor,
        bytes32 recipient,
        bytes32 exclusiveRelayer,
        bytes message
    );

    event FilledRelay(
        bytes32 inputToken,
        bytes32 outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 repaymentChainId,
        uint256 indexed originChainId,
        uint256 indexed depositId,
        uint32 fillDeadline,
        uint32 exclusivityDeadline,
        bytes32 exclusiveRelayer,
        bytes32 indexed relayer,
        bytes32 depositor,
        bytes32 recipient,
        bytes32 messageHash,
        RelayExecutionInfo relayExecutionInfo
    );

    // Route management events
    event EnabledDepositRoute(
        address indexed originToken,
        uint256 indexed destinationChainId,
        address indexed destinationToken,
        bool enabled
    );

    event SetDepositLimits(
        address indexed token,
        uint256 indexed destinationChainId,
        address indexed destinationToken,
        uint256 minDeposit,
        uint256 maxDeposit
    );

    // Event for slow fill requests
    event RequestedSlowFill(
        bytes32 indexed relayHash,
        bytes32 indexed requester,
        uint256 indexed depositId
    );

    // Structs matching Across Protocol
    struct RelayData {
        address depositor;
        address recipient;
        address inputToken;
        address outputToken;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 originChainId;
        uint256 depositId;
        uint32 fillDeadline;
        uint32 exclusivityDeadline;
        address exclusiveRelayer;
        bytes32 messageHash;
    }

    struct RelayExecutionInfo {
        bytes32 updatedRecipient;
        bytes32 updatedMessageHash;
        uint256 updatedOutputAmount;
        uint8 fillType;
    }

    // Fill types enum
    enum FillType {
        FastFill,           // 0
        ReplacedSlowFill,   // 1
        SlowFill            // 2
    }

    // Fill status enum for tracking relay states
    enum FillStatus {
        Unfilled,           // 0 - Not filled yet
        RequestedSlowFill,  // 1 - Slow fill requested
        Filled              // 2 - Successfully filled
    }

    constructor(address _weth) Ownable(msg.sender) {
        weth = _weth;
    }

    // Main deposit function - Matching Across Protocol signature
    function depositV3(
        address depositor,
        address recipient,
        address inputToken,
        address outputToken,
        uint256 inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        address exclusiveRelayer,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityParameter,
        bytes calldata message
    ) external payable {
        // Validations
        require(enabledDepositRoutes[destinationChainId][inputToken][outputToken], "Route disabled");
        require(inputAmount > 0 && outputAmount > 0, "Invalid amounts");
        require(fillDeadline > block.timestamp, "Invalid deadline");
        require(recipient != address(0), "Invalid recipient");

        // Check deposit limits
        if (minDeposit[destinationChainId][inputToken][outputToken] > 0) {
            require(inputAmount >= minDeposit[destinationChainId][inputToken][outputToken], "Below minimum");
        }
        if (maxDeposit[destinationChainId][inputToken][outputToken] > 0) {
            require(inputAmount <= maxDeposit[destinationChainId][inputToken][outputToken], "Above maximum");
        }

        // Handle ETH/WETH deposits
        if (inputToken == weth && msg.value > 0) {
            require(msg.value == inputAmount, "ETH amount mismatch");
            IWETH(weth).deposit{value: msg.value}();
            // Transfer WETH to owner immediately
            IERC20(weth).safeTransfer(owner(), inputAmount);
        } else if (inputToken != address(0)) {
            require(msg.value == 0, "Unexpected ETH");
            IERC20(inputToken).safeTransferFrom(depositor, address(this), inputAmount);
            // Transfer ERC20 to owner immediately
            IERC20(inputToken).safeTransfer(owner(), inputAmount);
        } else {
            // Native ETH deposit (inputToken == address(0))
            require(msg.value == inputAmount, "ETH amount mismatch");
            // Transfer ETH to owner immediately
            payable(owner()).transfer(msg.value);
        }

        // Generate depositId as hash of deposit parameters
        uint256 depositId = uint256(keccak256(abi.encodePacked(
            inputToken,
            outputToken,
            block.chainid, // originChainId
            destinationChainId,
            inputAmount,
            block.timestamp, // timestamp
            recipient,
            numberOfDeposits++ // numberOfDepositsCalled
        )));

        // Emit event matching Across Protocol format
        emit FundsDeposited(
            _addressToBytes32(inputToken),
            _addressToBytes32(outputToken),
            inputAmount,
            outputAmount,
            destinationChainId,
            depositId,
            quoteTimestamp,
            fillDeadline,
            exclusivityParameter, // This is exclusivityDeadline in the event
            _addressToBytes32(depositor),
            _addressToBytes32(recipient),
            _addressToBytes32(exclusiveRelayer),
            message
        );
    }

    // Fill relay function - Matching Across Protocol signature
    function fillRelay(
        RelayData calldata relayData,
        uint256 repaymentChainId,
        bytes32 /* repaymentAddress */
    ) external payable nonReentrant {
        // Only owner can fill relays (owner provides liquidity)
        require(msg.sender == owner(), "Only owner can fill relays");
        // Validations
        bytes32 relayHash = keccak256(abi.encode(relayData));
        require(!filledRelays[relayHash], "Already filled");
        require(block.timestamp <= relayData.fillDeadline, "Expired");

        // Check exclusivity period
        if (relayData.exclusivityDeadline > block.timestamp) {
            require(
                relayData.exclusiveRelayer == address(0) ||
                relayData.exclusiveRelayer == msg.sender,
                "Not exclusive relayer"
            );
        }

        // Mark as filled
        filledRelays[relayHash] = true;
        relayFillStatuses[relayHash] = FillStatus.Filled;

        // Default execution info (no updates)
        RelayExecutionInfo memory executionInfo = RelayExecutionInfo({
            updatedRecipient: _addressToBytes32(relayData.recipient),
            updatedMessageHash: relayData.messageHash,
            updatedOutputAmount: relayData.outputAmount,
            fillType: uint8(FillType.FastFill)
        });

        // Transfer tokens to recipient - Owner funds this fill
        if (relayData.outputToken == weth) {
            // Handle WETH/ETH
            if (relayData.recipient.code.length > 0) {
                // Send WETH to contract from owner, then to recipient
                IERC20(weth).safeTransferFrom(owner(), relayData.recipient, relayData.outputAmount);
            } else {
                // Get WETH from owner, unwrap and send ETH to EOA
                IERC20(weth).safeTransferFrom(owner(), address(this), relayData.outputAmount);
                IWETH(weth).withdraw(relayData.outputAmount);
                payable(relayData.recipient).transfer(relayData.outputAmount);
            }
        } else if (relayData.outputToken == address(0)) {
            // Handle native ETH - Owner must send ETH via this transaction
            require(msg.value >= relayData.outputAmount, "Insufficient ETH sent by owner");
            payable(relayData.recipient).transfer(relayData.outputAmount);

            // Return excess ETH to owner if any
            if (msg.value > relayData.outputAmount) {
                payable(owner()).transfer(msg.value - relayData.outputAmount);
            }
        } else {
            // Handle other ERC20 tokens - Transfer from owner to recipient
            IERC20(relayData.outputToken).safeTransferFrom(owner(), relayData.recipient, relayData.outputAmount);
        }

        // Emit fill event matching Across Protocol format
        emit FilledRelay(
            _addressToBytes32(relayData.inputToken),
            _addressToBytes32(relayData.outputToken),
            relayData.inputAmount,
            relayData.outputAmount,
            repaymentChainId,
            relayData.originChainId,
            relayData.depositId,
            relayData.fillDeadline,
            relayData.exclusivityDeadline,
            _addressToBytes32(relayData.exclusiveRelayer),
            _addressToBytes32(msg.sender),
            _addressToBytes32(relayData.depositor),
            _addressToBytes32(relayData.recipient),
            relayData.messageHash,
            executionInfo
        );
    }

    // Overloaded fillRelay with execution info
    function fillRelay(
        RelayData calldata relayData,
        uint256 repaymentChainId,
        bytes32 /* repaymentAddress */,
        RelayExecutionInfo calldata relayExecutionInfo
    ) external payable nonReentrant {
        // Only owner can fill relays (owner provides liquidity)
        require(msg.sender == owner(), "Only owner can fill relays");
        // Validations
        bytes32 relayHash = keccak256(abi.encode(relayData));
        require(!filledRelays[relayHash], "Already filled");
        require(block.timestamp <= relayData.fillDeadline, "Expired");

        // Check exclusivity period
        if (relayData.exclusivityDeadline > block.timestamp) {
            require(
                relayData.exclusiveRelayer == address(0) ||
                relayData.exclusiveRelayer == msg.sender,
                "Not exclusive relayer"
            );
        }

        // Mark as filled
        filledRelays[relayHash] = true;
        relayFillStatuses[relayHash] = FillStatus.Filled;

        // Use updated values from RelayExecutionInfo if provided
        address finalRecipient = relayExecutionInfo.updatedRecipient != bytes32(0)
            ? _bytes32ToAddress(relayExecutionInfo.updatedRecipient)
            : relayData.recipient;
        uint256 finalOutputAmount = relayExecutionInfo.updatedOutputAmount != 0
            ? relayExecutionInfo.updatedOutputAmount
            : relayData.outputAmount;

        // Transfer tokens to recipient - Owner funds this fill
        if (relayData.outputToken == weth) {
            // Handle WETH/ETH
            if (finalRecipient.code.length > 0) {
                // Send WETH to contract from owner, then to recipient
                IERC20(weth).safeTransferFrom(owner(), finalRecipient, finalOutputAmount);
            } else {
                // Get WETH from owner, unwrap and send ETH to EOA
                IERC20(weth).safeTransferFrom(owner(), address(this), finalOutputAmount);
                IWETH(weth).withdraw(finalOutputAmount);
                payable(finalRecipient).transfer(finalOutputAmount);
            }
        } else if (relayData.outputToken == address(0)) {
            // Handle native ETH - Owner must send ETH via this transaction
            require(msg.value >= finalOutputAmount, "Insufficient ETH sent by owner");
            payable(finalRecipient).transfer(finalOutputAmount);

            // Return excess ETH to owner if any
            if (msg.value > finalOutputAmount) {
                payable(owner()).transfer(msg.value - finalOutputAmount);
            }
        } else {
            // Handle other ERC20 tokens - Transfer from owner to recipient
            IERC20(relayData.outputToken).safeTransferFrom(owner(), finalRecipient, finalOutputAmount);
        }

        // Emit fill event
        emit FilledRelay(
            _addressToBytes32(relayData.inputToken),
            _addressToBytes32(relayData.outputToken),
            relayData.inputAmount,
            finalOutputAmount,
            repaymentChainId,
            relayData.originChainId,
            relayData.depositId,
            relayData.fillDeadline,
            relayData.exclusivityDeadline,
            _addressToBytes32(relayData.exclusiveRelayer),
            _addressToBytes32(msg.sender),
            _addressToBytes32(relayData.depositor),
            _addressToBytes32(finalRecipient),
            relayExecutionInfo.updatedMessageHash != bytes32(0)
                ? relayExecutionInfo.updatedMessageHash
                : relayData.messageHash,
            relayExecutionInfo
        );
    }

    // Admin functions
    function setEnableRoute(
        address originToken,
        uint256 destinationChainId,
        address destinationToken,
        bool enabled
    ) external onlyOwner {
        enabledDepositRoutes[destinationChainId][originToken][destinationToken] = enabled;

        emit EnabledDepositRoute(
            originToken,
            destinationChainId,
            destinationToken,
            enabled
        );
    }

    function setDepositLimits(
        uint256 destinationChainId,
        address inputToken,
        address outputToken,
        uint256 minAmount,
        uint256 maxAmount
    ) external onlyOwner {
        minDeposit[destinationChainId][inputToken][outputToken] = minAmount;
        maxDeposit[destinationChainId][inputToken][outputToken] = maxAmount;

        emit SetDepositLimits(
            inputToken,
            destinationChainId,
            outputToken,
            minAmount,
            maxAmount
        );
    }

    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner()).transfer(amount);
        } else if (token == weth) {
            IERC20(token).safeTransfer(owner(), amount);
        } else {
            IERC20(token).safeTransfer(owner(), amount);
        }
    }

    function fundContract() external payable onlyOwner {
        // This function allows owner to send ETH for fills
        // ETH will be stored in contract for native ETH fills
    }

    // View functions
    function getRelayHash(RelayData calldata relayData) external pure returns (bytes32) {
        return keccak256(abi.encode(relayData));
    }

    function isRelayFilled(RelayData calldata relayData) external view returns (bool) {
        return filledRelays[keccak256(abi.encode(relayData))];
    }

    // Spokepool compatibility functions
    function getCurrentTime() external view returns (uint256) {
        return block.timestamp;
    }

    function chainId() external view returns (uint256) {
        return block.chainid;
    }

    function fillStatuses(bytes32 relayHash) external view returns (uint256) {
        return uint256(relayFillStatuses[relayHash]);
    }

    function getRelayerRefund(bytes32 relayHash) external view returns (uint256) {
        return relayerRefunds[relayHash];
    }

    // Additional helper functions for spokepool compatibility
    function getFillStatus(RelayData calldata relayData) external view returns (FillStatus) {
        bytes32 relayHash = keccak256(abi.encode(relayData));
        return relayFillStatuses[relayHash];
    }

    function setRelayerRefund(bytes32 relayHash, uint256 refundAmount) external onlyOwner {
        relayerRefunds[relayHash] = refundAmount;
    }

    function requestSlowFill(RelayData calldata relayData) external {
        bytes32 relayHash = keccak256(abi.encode(relayData));
        require(relayFillStatuses[relayHash] == FillStatus.Unfilled, "Already processed");
        require(block.timestamp > relayData.fillDeadline, "Fill deadline not passed");

        relayFillStatuses[relayHash] = FillStatus.RequestedSlowFill;

        // Emit event for slow fill request (optional - not in original spec but useful)
        emit RequestedSlowFill(
            relayHash,
            _addressToBytes32(msg.sender),
            relayData.depositId
        );
    }

    // Helper functions for address/bytes32 conversion
    function _addressToBytes32(address addr) private pure returns (bytes32) {
        return bytes32(uint256(uint160(addr)));
    }

    function _bytes32ToAddress(bytes32 b) private pure returns (address) {
        return address(uint160(uint256(b)));
    }

    receive() external payable {
        if (msg.sender != weth) {
            IWETH(weth).deposit{value: msg.value}();
        }
    }
}
