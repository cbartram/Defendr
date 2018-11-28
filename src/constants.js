const { hash } = require('./util');
const CSRF_STATE = hash(process.env.NEST_CLIENT_SECRET + process.hrtime()[0] * 1000000 + process.hrtime()[1] / 1000).replace(/=/g, '');

module.exports = {
    CSRF_STATE,
    AUTHORIZATION_URL: `https://home.nest.com/login/oauth2?client_id=${process.env.NEST_CLIENT_ID}&state=${CSRF_STATE}`,
    PORT: process.env.PORT || 3000
};
