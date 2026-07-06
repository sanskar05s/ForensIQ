import os
from web3 import Web3

def write_hash_to_sepolia(file_hash: str, evidence_id: str) -> dict:
    """
    Writes a file hash to the Sepolia testnet as a transaction.
    Returns {tx_hash, success, error}
    """
    rpc_url = os.getenv("SEPOLIA_RPC_URL")
    private_key = os.getenv("SEPOLIA_PRIVATE_KEY")

    if not rpc_url or not private_key:
        return {"tx_hash": None, "success": False,
                "error": "Sepolia RPC or private key not configured"}

    try:
        w3 = Web3(Web3.HTTPProvider(rpc_url))
        if not w3.is_connected():
            return {"tx_hash": None, "success": False,
                    "error": "Cannot connect to Sepolia"}

        account = w3.eth.account.from_key(private_key)
        data = f"ForensIQ:{evidence_id}:{file_hash}".encode('utf-8')

        tx = {
            'to': account.address,
            'value': 0,
            'gas': 21000 + len(data) * 68,
            'gasPrice': w3.eth.gas_price,
            'nonce': w3.eth.get_transaction_count(account.address),
            'data': data,
            'chainId': 11155111
        }
        signed = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        return {"tx_hash": tx_hash.hex(), "success": True, "error": None}

    except Exception as e:
        return {"tx_hash": None, "success": False, "error": str(e)}
