const Ownable = artifacts.require("Ownable");

module.exports = (deployer) => {
    deployer.deploy(Ownable)
};
