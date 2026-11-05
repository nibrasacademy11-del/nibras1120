const mongoose = require('mongoose');

// A malformed id can never match a document, so it is a 404 rather than a server error
function validId(param = 'id') {
    return (req, res, next) => {
        if (!mongoose.Types.ObjectId.isValid(req.params[param])) {
            return res.status(404).json({ message: 'Not found.' });
        }
        next();
    };
}

module.exports = validId;
