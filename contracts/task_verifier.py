# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json

class TaskVerifier(gl.Contract):
    tasks: TreeMap[str, str]
    next_id: u256

    def __init__(self):
        self.tasks = TreeMap()
        self.next_id = u256(0)

    @gl.public.write
    def create_task(self, title: str, description: str, criteria: str) -> str:
        task_id = str(self.next_id)
        self.next_id = self.next_id + u256(1)

        task = {
            "title": title,
            "description": description,
            "criteria": criteria,
            "creator": str(gl.message.sender_address),
            "status": "open",
            "worker": "",
            "proof_url": "",
            "result": "",
            "reasoning": ""
        }
        self.tasks[task_id] = json.dumps(task, sort_keys=True)
        return task_id

    @gl.public.write
    def claim_task(self, task_id: str) -> bool:
        raw = self.tasks.get(task_id, "")
        if raw == "": return False
        task = json.loads(raw)
        if task["status"] != "open": return False

        task["status"] = "claimed"
        task["worker"] = str(gl.message.sender_address)
        self.tasks[task_id] = json.dumps(task, sort_keys=True)
        return True

    @gl.public.write
    def submit_proof(self, task_id: str, proof_url: str) -> bool:
        raw = self.tasks.get(task_id, "")
        if raw == "": return False
        task = json.loads(raw)
        if task["status"] != "claimed": return False
        if task["worker"] != str(gl.message.sender_address): return False

        task["status"] = "submitted"
        task["proof_url"] = proof_url
        self.tasks[task_id] = json.dumps(task, sort_keys=True)
        return True

    @gl.public.write
    def verify_task(self, task_id: str) -> str:
        raw = self.tasks.get(task_id, "")
        if raw == "": return "Task not found"

        task = json.loads(raw)
        if task["status"] != "submitted": return "Task is not submitted"

        proof_url = task["proof_url"]
        criteria = task["criteria"]
        title = task["title"]
        description = task["description"]

        # 1. Leader runs evaluation prompt
        def leader_fn():
            try:
                page = gl.nondet.web.render(proof_url, mode="text")
            except Exception as e:
                return {"approved": False, "reasoning": f"Fetch failed: {str(e)}"}

            prompt = f"""
            Task Title: {title}
            Description: {description}
            Target Completion Criteria: {criteria}

            Extracted Proof Page Material:
            {page[:2500]}

            Does the proof text demonstrate full fulfillment of the completion criteria?
            Reply ONLY with this JSON:
            {{"approved": true or false, "reasoning": "Technical verification reason statement."}}
            """
            return gl.nondet.exec_prompt(prompt, response_format="json")

        # 2. THE STEWARD FIX: Validator independently assesses the data to stop "rubber stamping" rejections
        def validator_fn(leader_res) -> bool:
            if not isinstance(leader_res, gl.vm.Return):
                return False
            
            leader_data = leader_res.calldata
            if not isinstance(leader_data, dict) or "approved" not in leader_data:
                return False
                
            # Execute an independent run on the validator node to verify criteria alignment
            try:
                my_validation_run = leader_fn()
            except Exception:
                return False

            # Strict Rule: The validator's independent execution run MUST agree with the leader's verdict
            if my_validation_run.get("approved") != leader_data.get("approved"):
                return False 

            # Enforce that the reasoning string contains an actual explanation (minimum 10 characters)
            if len(str(leader_data.get("reasoning", ""))) < 10:
                return False

            return True

        decision_dict = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        is_approved = decision_dict.get("approved", False)
        task["status"] = "approved" if is_approved else "rejected"
        task["result"] = str(is_approved)
        task["reasoning"] = decision_dict.get("reasoning", "Verification processed successfully.")
        
        self.tasks[task_id] = json.dumps(task, sort_keys=True)
        return json.dumps(decision_dict, sort_keys=True)

    @gl.public.view
    def get_task(self, task_id: str) -> str:
        return self.tasks.get(task_id, "{}")
