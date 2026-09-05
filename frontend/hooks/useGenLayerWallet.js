import { useState, useEffect } from 'react';

export function useGenLayerWallet() {
  const [account, setAccount] = useState(null);
  const [walletError, setWalletError] = useState(null);

  useEffect(() => {
    // Explicit provider verification check
    const detectedProvider = window.ethereum || window.genlayer;
    if (!detectedProvider) {
      setWalletError("A real web3 browser wallet is required. No provider detected.");
      return;
    }

    const handleAccounts = (accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setWalletError("User wallet account disconnected.");
      } else {
        setAccount(accounts[0]);
        setWalletError(null);
      }
    };

    detectedProvider.on('accountsChanged', handleAccounts);
    detectedProvider.request({ method: 'eth_accounts' }).then(handleAccounts).catch(() => {});

    return () => {
      if (detectedProvider.removeListener) {
        detectedProvider.removeListener('accountsChanged', handleAccounts);
      }
    };
  }, []);

  const connectWallet = async () => {
    const detectedProvider = window.ethereum || window.genlayer;
    if (!detectedProvider) return setWalletError("No real wallet extension available.");
    try {
      setWalletError(null);
      const accounts = await detectedProvider.request({ method: 'eth_requestAccounts' });
      setAccount(accounts[0]);
    } catch (err) {
      setWalletError(err.code === 4001 ? "Connection request rejected by user." : err.message);
    }
  };

  return { account, connectWallet, walletError };
}
