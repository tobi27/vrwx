// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../../src/depin/VRWXToken.sol";

contract VRWXTokenTest is Test {
    VRWXToken public token;
    address public admin;
    address public minter;
    address public burner;
    address public user;

    function setUp() public {
        admin = address(this);
        minter = address(0x1);
        burner = address(0x2);
        user = address(0x3);

        token = new VRWXToken();

        // Grant roles
        token.grantRole(token.MINTER_ROLE(), minter);
        token.grantRole(token.BURNER_ROLE(), burner);
    }

    function test_MintWithRole() public {
        vm.prank(minter);
        token.mint(user, 1000 ether);

        assertEq(token.balanceOf(user), 1000 ether);
        assertEq(token.totalSupply(), 1000 ether);
    }

    function test_BurnWithRole() public {
        // First mint some tokens
        vm.prank(minter);
        token.mint(user, 1000 ether);

        // User approves burner
        vm.prank(user);
        token.approve(burner, 500 ether);

        // Burner burns tokens
        vm.prank(burner);
        token.burn(user, 500 ether);

        assertEq(token.balanceOf(user), 500 ether);
        assertEq(token.totalSupply(), 500 ether);
    }

    function test_RevertMintWithoutRole() public {
        vm.prank(user);
        vm.expectRevert();
        token.mint(user, 1000 ether);
    }

    function test_RevertBurnWithoutRole() public {
        vm.prank(minter);
        token.mint(user, 1000 ether);

        vm.prank(user);
        vm.expectRevert();
        token.burn(user, 500 ether);
    }

    function test_TokenNameAndSymbol() public view {
        assertEq(token.name(), "VRWX Token");
        assertEq(token.symbol(), "VRWX");
    }
}
