// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

library Errors {
    error NotAuthorized();
    error InvalidSignature();
    error JobNotFound();
    error InvalidStatus();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InsufficientBond();
    error ChallengeWindowActive();
    error ChallengeWindowPassed();
    error ClaimAlreadyUsed();
    error ZeroAddress();
    error ZeroAmount();
    error InsufficientBalance();
    error RobotNotFound();
    error RobotAlreadyExists();
    error DisputeNotFound();
    error DisputeAlreadyExists();
    error InvalidVerdict();
    error TokenAlreadyMinted();
    error TokenNotFound();

    // DePIN errors
    error InvalidAmount();
    error UnlockAlreadyPending();
    error NoUnlockPending();
    error TimelockActive();
    error InsufficientStake();
    error OfferNotFound();
    error OfferNotActive();
    error OfferExpired();
}
