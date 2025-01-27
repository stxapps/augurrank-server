import { verifyECDSA } from '@stacks/encryption';
import { getAddressFromPublicKey } from '@stacks/transactions';

import { STX_TST_STR } from './const';

const verify = (stxAddr, stxTstStr, stxPubKey, stxSigStr) => {
  if (stxTstStr !== STX_TST_STR) return false;

  const addr = getAddressFromPublicKey(stxPubKey);
  if (addr !== stxAddr) return false;

  const rst = verifyECDSA(stxTstStr, stxPubKey, stxSigStr);
  return rst;
};

const auth = { verify };

export default auth;
