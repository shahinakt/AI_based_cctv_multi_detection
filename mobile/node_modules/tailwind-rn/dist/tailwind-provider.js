"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = require("react");
const react_native_1 = require("react-native");
const hooks_1 = require("@react-native-community/hooks");
const tailwind_context_1 = require("./tailwind-context");
const create_1 = require("./create");
const TailwindProvider = ({ utilities, colorScheme: overrideColorScheme, children }) => {
    var _a;
    const colorScheme = (_a = (0, react_native_1.useColorScheme)()) !== null && _a !== void 0 ? _a : 'light';
    const { width, height } = (0, hooks_1.useDimensions)().window;
    const { reduceMotionEnabled: reduceMotion } = (0, hooks_1.useAccessibilityInfo)();
    const orientation = (0, hooks_1.useDeviceOrientation)().portrait
        ? 'portrait'
        : 'landscape';
    const tailwind = React.useMemo(() => {
        return (0, create_1.default)(utilities, {
            colorScheme: overrideColorScheme !== null && overrideColorScheme !== void 0 ? overrideColorScheme : colorScheme,
            width,
            height,
            reduceMotion: Boolean(reduceMotion),
            orientation
        });
    }, [
        utilities,
        colorScheme,
        overrideColorScheme,
        width,
        height,
        reduceMotion,
        orientation
    ]);
    return (React.createElement(tailwind_context_1.default.Provider, { value: tailwind }, children));
};
exports.default = TailwindProvider;
