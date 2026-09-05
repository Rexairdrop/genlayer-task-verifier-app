import { useState } from 'react';
import { createClient } from 'genlayer-js';

const CONTRACT_ADDRESS = "0x919bb40F757F4eb50FcC7fBBf5E703FC8463CF38";
const GENLAYER_RPC_URL = process.env.NEXT_PUBLIC_GENLAYER_RPC_URL || "https://genlayer.com";

export function useDAppWorkflow(account) {
  const [logs, setLogs] = useState([{ text: "System initialized. Awaiting true transaction execution...", type: 'info' }]);
  const [isPending, setIsPending] = useState(false);

  const addLog = (text, type) => setLogs(prev => [...prev, { text, type }]);

  // Direct Contract Write Wrapper
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

  // 1. CREATE TASK
  const createTask = async (title, description, criteria) => {
    await runContractWrite("create_task", [title, description, criteria], "Create Task");
  };

  // 2. CLAIM TASK
  const claimTask = async (taskId) => {
    await runContractWrite("claim_task", [String(taskId)], "Claim Task");
  };

  // 3. SUBMIT PROOF
  const submitProof = async (taskId, proofUrl) => {
    await runContractWrite("submit_proof", [String(taskId), proofUrl], "Submit Proof");
  };

  // 4. VERIFY TASK (Triggers Validator Consensus)
  const verifyTask = async (taskId) => {
    await runContractWrite("verify_task", [String(taskId)], "Verify Task");
  };

  // 5. PURE RPC READ STATE (No mock fallback)
  const readTaskState = async (taskId) => {
    addLog(`Fetching true parameters for Task #${taskId} from blockchain RPC...`, "info");
    try {
      const client = createClient({ rpcUrl: GENLAYER_RPC_URL });
      const rawResult = await client.readContract({
        to: CONTRACT_ADDRESS,
        data: { method: "get_task", args: [String(taskId)] }
      });

      if (!rawResult || rawResult === "{}") throw new Error("Task not found or empty response returned.");
      
      const parsedTask = typeof rawResult === 'string' ? JSON.parse(rawResult) : rawResult;
      addLog(`On-Chain State: Status: ${parsedTask.status} | Result: ${parsedTask.result}`, "success");
      if (parsedTask.reasoning) addLog(`AI Reasoning: ${parsedTask.reasoning}`, "info");
      
      return parsedTask;
    } catch (error) {
      addLog(`State Fetch Failed: ${error.message || 'GenLayer RPC network unreachable.'}`, "error");
      return null;
    }
  };

  return { createTask, claimTask, submitProof, verifyTask, readTaskState, logs, isPending };
}
