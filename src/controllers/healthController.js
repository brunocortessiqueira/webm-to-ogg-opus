'use strict';

const apiResponse = require('../utils/apiResponse');

function handle(req, res) {
  return apiResponse.health(res);
}

module.exports = { handle };
