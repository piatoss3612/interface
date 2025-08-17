import { initEthEWallet, type EIP1193Provider, type EthEWallet } from '@keplr-ewallet/ewallet-sdk-eth'
import { CONNECTION_PROVIDER_IDS, CONNECTION_PROVIDER_NAMES } from 'uniswap/src/constants/web3'
import { getAddress, toHex } from 'viem'
import { CreateConnectorFn, createConnector } from 'wagmi'

export function keplrEWallet(): CreateConnectorFn {
  let initPromise: Promise<EthEWallet> | null = null

  let ethEWallet: EthEWallet | null = null
  let provider: EIP1193Provider | null = null

  const ensureInit = () => {
    if (!initPromise) {
      initPromise = (async () => {
        const initRes = await initEthEWallet({
          api_key: '72bd2afd04374f86d563a40b814b7098e5ad6c7f52d3b8f84ab0c3d05f73ac6c',
          sdk_endpoint: 'http://localhost:3201',
        })
        if (!initRes.success) {
          throw new Error(`init fail: ${initRes.err}`)
        }
        ethEWallet = initRes.data
        return initRes.data
      })()
    }
    return initPromise
  }

  return createConnector<EIP1193Provider>((config) => {
    const wallet = {
      id: CONNECTION_PROVIDER_IDS.KEPLR_EWALLET_CONNECTOR_ID,
      name: CONNECTION_PROVIDER_NAMES.KEPLR_EWALLET,
      type: 'keplr-ewallet' as const,
      icon: keplrIcon,
      setup: async () => {
        await ensureInit()
      },
      connect: async (parameters?: { chainId?: number | undefined; isReconnecting?: boolean | undefined }) => {
        const ethEWallet = await ensureInit()

        let accounts = await wallet.getAccounts()

        // if accounts is empty, try sign in
        if (accounts.length === 0) {
          if (parameters?.isReconnecting) {
            return {
              accounts,
              chainId: await wallet.getChainId(),
            }
          }

          await ethEWallet.eWallet.signIn('google')
        }

        const chainId = await wallet.getChainId()

        if (parameters?.chainId && chainId !== parameters.chainId) {
          await wallet.switchChain({ chainId: parameters.chainId })
        }

        // re-request accounts, there should be at least one account after sign in
        accounts = await wallet.getAccounts()

        return {
          accounts,
          chainId,
        }
      },
      disconnect: async () => {
        const providerInstance = await wallet.getProvider()
        providerInstance.removeListener('accountsChanged', wallet.onAccountsChanged)
        providerInstance.removeListener('chainChanged', wallet.onChainChanged)

        await ethEWallet?.eWallet.signOut()
      },
      getAccounts: async () => {
        const providerInstance = await wallet.getProvider()
        const accounts = await providerInstance.request({
          method: 'eth_accounts',
        })
        return accounts.map((x: string) => getAddress(x))
      },
      getChainId: async () => {
        const providerInstance = await wallet.getProvider()
        const chainId = await providerInstance.request({
          method: 'eth_chainId',
        })
        return Number(chainId)
      },
      getProvider: async (): Promise<EIP1193Provider> => {
        if (provider) {
          return provider
        }

        const ethEWallet = await ensureInit()

        provider = await ethEWallet.getEthereumProvider()

        provider.on('chainChanged', (chainId) => {
          wallet.onChainChanged(chainId)
        })

        provider.on('accountsChanged', (accounts) => {
          wallet.onAccountsChanged(accounts)
        })

        return provider
      },
      isAuthorized: async () => {
        const accounts = await wallet.getAccounts()
        return accounts.length > 0
      },
      switchChain: async ({ chainId }: { chainId: number }) => {
        const providerInstance = await wallet.getProvider()
        await providerInstance.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: toHex(chainId) }],
        })

        // Return the chain object instead of just the chainId
        return config.chains.find((chain) => chain.id === chainId) || config.chains[0]
      },
      onAccountsChanged: (accounts: string[]) => {
        if (accounts.length === 0) {
          wallet.onDisconnect()
        } else {
          config.emitter.emit('change', {
            accounts: accounts.map((x: string) => getAddress(x)),
          })
        }
      },
      onChainChanged: (chainId: string | number) => {
        const chainIdNumber = Number(chainId)
        config.emitter.emit('change', { chainId: chainIdNumber })
      },
      onDisconnect: () => {
        config.emitter.emit('disconnect')
      },
    }

    return wallet
  })
}

const keplrIcon =
  'data:image/png;base64,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'
