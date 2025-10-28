"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const react_1 = require("react");
const tailwind_context_1 = require("./tailwind-context");
const useTailwind = () => {
    return (0, react_1.useContext)(tailwind_context_1.default);
};
exports.default = useTailwind;
