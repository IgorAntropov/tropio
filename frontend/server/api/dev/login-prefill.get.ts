import { prefillLocalLogin } from '../../utils/local-login-prefill';

export default defineEventHandler(event => prefillLocalLogin(event.node.req, event.node.res));
