"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const colorString = require("color-string");
const evaluateStyle = (object) => {
    const newObject = {};
    for (const [key, value] of Object.entries(object)) {
        if (!key.startsWith('--')) {
            if (typeof value === 'string') {
                let newValue = value.replace(/var\(([a-zA-Z-]+)\)/, (_, name) => {
                    return object[name];
                });
                // Convert rgb(0 0 0 / 1) into rgba(0, 0, 0, 1), because
                // React Native doesn't support the newer format
                if (newValue !== 'transparent' && newValue.startsWith('rgb(')) {
                    const color = colorString.get.rgb(newValue);
                    if (color) {
                        newValue = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3]})`;
                    }
                }
                newObject[key] = newValue;
            }
            else {
                newObject[key] = value;
            }
        }
    }
    return newObject;
};
exports.default = evaluateStyle;
