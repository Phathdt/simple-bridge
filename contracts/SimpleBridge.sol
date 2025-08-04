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
    uint32 public numberOfDeposits;

    // State mappings
    mapping(uint256 => mapping(address => mapping(address => bool))) public enabledRoutes;
    mapping(bytes32 => bool) public filledRelays;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public minDeposit;
    mapping(uint256 => mapping(address => mapping(address => uint256))) public maxDeposit;

    // Events - Compatible with Across Protocol (max 3 indexed params)
    event V3FundsDeposited(
        address indexed inputToken,
        address indexed outputToken,
        uint256 indexed inputAmount,
        uint256 outputAmount,
        uint256 destinationChainId,
        uint32 depositId,
        uint32 quoteTimestamp,
        uint32 fillDeadline,
        uint32 exclusivityParameter,
        address depositor,
        address recipient,
        address exclusiveRelayer,
        bytes message
    );

    event FilledV3Relay(
        address indexed inputToken,
        address indexed outputToken,
        uint256 indexed inputAmount,
        uint256 outputAmount,
        uint256 repaymentChainId,
        uint256 originChainId,
        uint32 depositId,
        uint32 fillDeadline,
        uint32 exclusivityParameter,
        address relayer,
        address depositor,
        address recipient,
        address exclusiveRelayer,
        bytes message
    );

    struct V3RelayData {
        address depositor;
        address recipient;
        address inputToken;
        address outputToken;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 originChainId;
        uint32 depositId;
        uint32 fillDeadline;
        uint32 exclusivityParameter;
        address exclusiveRelayer;
        bytes message;
    }

    constructor(address _weth) Ownable(msg.sender) {
        weth = _weth;
    }


    // Main deposit function - Compatible with Across
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
        require(enabledRoutes[destinationChainId][inputToken][outputToken], "Route disabled");
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
        } else if (inputToken != address(0)) {
            require(msg.value == 0, "Unexpected ETH");
            IERC20(inputToken).safeTransferFrom(depositor, address(this), inputAmount);
        } else {
            // Native ETH deposit (inputToken == address(0))
            require(msg.value == inputAmount, "ETH amount mismatch");
        }

        uint32 depositId = numberOfDeposits++;

        // Emit event for worker to detect
        emit V3FundsDeposited(
            inputToken,
            outputToken,
            inputAmount,
            outputAmount,
            destinationChainId,
            depositId,
            quoteTimestamp,
            fillDeadline,
            exclusivityParameter,
            depositor,
            recipient,
            exclusiveRelayer,
            message
        );
    }

    // Fill relay function - Transfer funds to user
    function fillV3Relay(
        V3RelayData calldata relayData,
        uint256 repaymentChainId
    ) external nonReentrant {
        // Validations
        bytes32 relayHash = keccak256(abi.encode(relayData));
        require(!filledRelays[relayHash], "Already filled");
        require(block.timestamp <= relayData.fillDeadline, "Expired");

        // Check exclusivity period
        if (relayData.exclusivityParameter > block.timestamp) {
            require(
                relayData.exclusiveRelayer == address(0) ||
                relayData.exclusiveRelayer == msg.sender,
                "Not exclusive relayer"
            );
        }

        // Mark as filled
        filledRelays[relayHash] = true;

        // Transfer tokens to recipient - CORE LOGIC
        if (relayData.outputToken == weth) {
            // Handle WETH/ETH
            if (relayData.recipient.code.length > 0) {
                // Send WETH to contract
                IERC20(weth).safeTransfer(relayData.recipient, relayData.outputAmount);
            } else {
                // Unwrap and send ETH to EOA
                IWETH(weth).withdraw(relayData.outputAmount);
                payable(relayData.recipient).transfer(relayData.outputAmount);
            }
        } else if (relayData.outputToken == address(0)) {
            // Handle native ETH
            payable(relayData.recipient).transfer(relayData.outputAmount);
        } else {
            // Handle other ERC20 tokens
            IERC20(relayData.outputToken).safeTransfer(relayData.recipient, relayData.outputAmount);
        }

        // Handle cross-chain message (if any)
        if (relayData.message.length > 0 && relayData.recipient.code.length > 0) {
            (bool success,) = relayData.recipient.call(relayData.message);
            // Intentionally ignore success to not revert on message call failures
            success; // Suppress unused variable warning
        }

        // Emit fill event
        emit FilledV3Relay(
            relayData.inputToken,
            relayData.outputToken,
            relayData.inputAmount,
            relayData.outputAmount,
            repaymentChainId,
            relayData.originChainId,
            relayData.depositId,
            relayData.fillDeadline,
            relayData.exclusivityParameter,
            msg.sender,
            relayData.depositor,
            relayData.recipient,
            relayData.exclusiveRelayer,
            relayData.message
        );
    }

    // Admin functions
    function enableRoute(
        uint256 destinationChainId,
        address inputToken,
        address outputToken,
        bool enabled
    ) external onlyOwner {
        enabledRoutes[destinationChainId][inputToken][outputToken] = enabled;
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
        if (msg.value > 0) {
            IWETH(weth).deposit{value: msg.value}();
        }
    }


    // View functions
    function getRelayHash(V3RelayData calldata relayData) external pure returns (bytes32) {
        return keccak256(abi.encode(relayData));
    }

    function isRelayFilled(V3RelayData calldata relayData) external view returns (bool) {
        return filledRelays[keccak256(abi.encode(relayData))];
    }

    receive() external payable {
        if (msg.sender != weth) {
            IWETH(weth).deposit{value: msg.value}();
        }
    }
}
