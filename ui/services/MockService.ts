import { OffChainTransferRequest } from "@tallyho/tally-background/assets";
import { resolveConfig } from "prettier";
import { DEFAULT_ASSETS } from "./spec/assets";
import { LOGGED_IN_CREDENTIALS, REQUEST_2FA } from "./spec/auth";
import { DEFAULT_TRANSFER_CONFIRMATION_MATIC } from "./spec/transfer";

const { fetch: originalFetch } = window;

export const initializeAPIMocks  = () => {

    window.fetch = async (...args) => {
        let [resource, config ] = args;
        console.log({args, resource, config}, "resource.toString()", resource.toString());

        if (resource.toString().includes('/v1/login')) {
            const body = JSON.parse(config?.body!.toString()!);
            console.log({body});
            console.log("body.username?.includes('2fa')", body.username?.includes('2fa'));
            if (body.username?.includes('2fa') && !body.challengeResponse) {
                return updateResponseJSON(config!, REQUEST_2FA);
            } else {
                return updateResponseJSON(config!, LOGGED_IN_CREDENTIALS);
            }
            
         };

        if (resource.toString().includes('/v1/assets')) {
            return updateResponseJSON(config!, {assets: DEFAULT_ASSETS});
         };

         if (resource.toString().includes('/v1/transfer')) {
            const body = JSON.parse(config?.body!.toString()!) as OffChainTransferRequest;
            console.log({body});
            resource = "http://localhost:8000/api/v1/transfer/"
          };
    
        return originalFetch(resource, config);
        // response interceptor here
        // return response;
    };


}

export const updateResponseJSON = async (config: RequestInit, newData: any, resource = 'https://reqres.in/api/users') => {

    let originalResponse = await originalFetch(resource, config);
    return originalResponse
    .clone()
    .json()
    .then((data: any) => (newData));
}
