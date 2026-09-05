import { useState } from 'react';
import { createClient } from 'genlayer-js';

const CONTRACT_ADDRESS = "0x919bb40F757F4eb50FcC7fBBf5E703FC8463CF38";
const GENLAYER_RPC_URL = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://genlayer.com";

export function useDAppWorkflow(account) {
  const [logs, setLogs] = useState([{ text: "System initialized. Awaiting live wallet execution...", type: 'info' }]);
  const [isPending, setIsPending] = useState(false);

  const addLog = (text, type) => setLogs(prev => [...prev, { text, type }]);

  // Direct Contract Write Actions
  const runContractWrite = async (methodName, args, actionLabel) => {
    if (!account) return addLog(`Error: Connect a wallet to sign ${actionLabel}.`, "error");
    setIsPending(true);
    addLog(`Requesting real user signature for [${actionLabel}]...`, "pending");

    try {
      const client = createClient({ rpcUrl: GENLAYER_RPC_URL, account });
      const tx = await client.sendTransaction({
        to: CONTRACT_ADDRESS,
        data: { method: methodName, args: args }
      });

      addLog(`Transaction broadcasted! Hash: ${tx.hash}`, "info");
      const receipt = await client.waitForTransactionReceipt({ hash: tx.hash });
      
      if (receipt.status === 'success') {
        addLog(`[Success] ${actionLabel} completed on-chain in block ${receipt.blockNumber}`, "success");
      } else {
        addLog(`Revert: Contract logic rejected the transaction execution.`, "error");
      }
    } catch (error) {
      if (error.code === 4001) {
        addLog(`User rejected transaction in wallet.`, "error");
      } else if (error.message?.includes("fetch") || error.message?.includes("network")) {
        addLog(`GenLayer RPC request failed. Check network connection and endpoints.`, "error");
      } else {
        addLog(`Contract execution failure: ${error.message}`, "error");
      }
    } finally {
      setIsPending(false);
    }
  };

  // Pure RPC Contract Read State (No local mock data fallback)
  const readTaskState = async (milestoneId) => {
    addLog(`Fetching true state parameters for Milestone #${milestoneId}...`, "info");
    try {
      const client = createClient({ rpcUrl: GENLAYER_RPC_URL });
      const stateResult = await client.readContract({
        to: CONTRACT_ADDRESS,
        data: { method: "get_milestone_state", args: [milestoneId] }
      });

      if (!stateResult) throw new Error("Empty execution structure returned from RPC.");
      addLog(`On-Chain State: Status: ${stateResult.status} | Consensus Score: ${stateResult.score}/100`, "success");
      return stateResult;
    } catch (error) {
      addLog(`State Fetch Failed: ${error.message || 'GenLayer RPC network unreachable.'}`, "error");
      return null;
    }
  };

  return { runContractWrite, readTaskState, logs, isPending };
}
