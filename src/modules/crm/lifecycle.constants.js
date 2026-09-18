'use strict';

/**
 * Re-export dari src/config/lifecycle.constants.js
 * Menghindari issue module resolution jika ada pemanggilan relative dari direktori crm.
 */
module.exports = require('../../config/lifecycle.constants');
