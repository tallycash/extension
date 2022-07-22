import React from 'react'
import { OffChainProvider } from '@tallyho/tally-background/accounts'
import SharedSelect, { Option } from "../Shared/SharedSelect"
import { offChainProviders } from '@tallyho/tally-background/constants/off-chain'


const offChainProviderOptions: Option[] = offChainProviders.map(provider =>({
    label: <>
    {provider.name}
    <img src={provider.logoUrl} width={25} 
         style={{ verticalAlign: "middle", margin: "7px"}} />
    </>,
    value: provider.name,
}))

interface OffChainProviderSelectProps {
    onProviderChange: (provider: OffChainProvider) => void
}
function OffChainProviderSelect({onProviderChange}: OffChainProviderSelectProps) {

    
    const handleOnProviderChange = (selectedName: string) => {

        const selectedProvider = offChainProviders.find(provider => (
            provider.name === selectedName
        ));
        if (selectedProvider) {
            onProviderChange(selectedProvider)
        }
    }
    
  return (
    <>
    
    <SharedSelect
                  width={200}
                  options={offChainProviderOptions}
                  onChange={handleOnProviderChange}
                />
    </>
  )
}

export default OffChainProviderSelect