pragma solidity 0.5.8;

/*
    Contract is needed only for test. Should not be deployed.
*/
contract DummyContract {
    function() external payable {}
    function testCall(address payable c) external {
        c.transfer(1);
    }
}
