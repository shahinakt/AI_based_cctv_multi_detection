"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const em_to_px_1 = require("./em-to-px");
const remToPx = (value) => `${(0, em_to_px_1.default)(value, 16)}px`;
exports.default = remToPx;
