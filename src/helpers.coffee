Promise = global.Promise ? require('es6-promise').Promise

exports.wait = (timeInMs) -> new Promise (resolve, reject) ->
    setTimeout resolve, timeInMs
