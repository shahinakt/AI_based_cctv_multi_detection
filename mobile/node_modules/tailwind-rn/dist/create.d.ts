import { Utilities, Style, Environment } from './types';
declare const create: (utilities: Utilities, environment: Environment) => (classNames: string) => Style;
export default create;
