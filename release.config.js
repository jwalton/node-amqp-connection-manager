module.exports = {
    "extends": "@jwalton/semantic-release-config",
    "verifyConditions": [
        "@semantic-release/changelog",
        "@semantic-release/npm",
        "@semantic-release/git"
    ],
    "prepare": [
        "@semantic-release/changelog",
        "@semantic-release/npm",
        "@semantic-release/git"
    ]
};
