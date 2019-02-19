module.exports = {
    require: ["@babel/register"],
    reporter: "spec",
    recursive: true,
    "check-leaks": true,
    exit: true,
    spect: 'test/**/*.js',
};
