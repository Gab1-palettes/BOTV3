import cors from "cors";
import helmet from "helmet";
import compression from "compression";
export function securityStack(){
  return [ helmet(), compression(), cors({ origin: (o,cb)=>cb(null,true), credentials:true }) ];
}
