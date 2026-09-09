"""
MetaTrader 5 Native Local IPC Bridge
====================================
FastAPI microservice running locally on http://127.0.0.1:8000.
Connects via Windows named pipes / IPC to terminal64.exe using the official MetaTrader5 Python package.
Handles real order execution via mt5.order_send(), slippage bounds, retcodes, and ticket management.
"""

import os
import sys
import time
from typing import Optional, List
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(
    title="MetaTrader 5 Local Gateway",
    version="1.0.0",
    description="Local Windows IPC bridge for Darwinian Swarm Execution"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Attempt MetaTrader5 native import (requires Windows terminal)
MT5_AVAILABLE = False
try:
    import MetaTrader5 as mt5
    MT5_AVAILABLE = True
except ImportError:
    mt5 = None
    MT5_AVAILABLE = False

class OrderRequestModel(BaseModel):
    symbol: str
    action: str  # BUY or SELL
    volume: float
    order_type: str = "MARKET"
    price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    deviation: int = 10
    comment: str = "SwarmAlpha"
    magic: int = 202609

class PositionCloseModel(BaseModel):
    ticket: int
    deviation: int = 10

@app.on_event("startup")
def startup_event():
    global MT5_AVAILABLE
    if MT5_AVAILABLE:
        # Initialize connection to terminal64.exe
        initialized = mt5.initialize()
        if not initialized:
            print(f"[MT5 Gateway] mt5.initialize() failed: {mt5.last_error()}", file=sys.stderr)
        else:
            terminal_info = mt5.terminal_info()
            print(f"[MT5 Gateway] Connected to MT5: build={terminal_info.build if terminal_info else 'N/A'}")
    else:
        print("[MT5 Gateway] MetaTrader5 native library not available (non-Windows or not installed).")

@app.on_event("shutdown")
def shutdown_event():
    if MT5_AVAILABLE:
        mt5.shutdown()

@app.get("/health")
def health_check():
    connected = False
    terminal_build = None
    account_login = None
    
    if MT5_AVAILABLE:
        term = mt5.terminal_info()
        if term:
            connected = term.connected
            terminal_build = term.build
        account = mt5.account_info()
        if account:
            account_login = account.login

    return {
        "status": "online",
        "mt5_available": MT5_AVAILABLE,
        "terminal_connected": connected,
        "terminal_build": terminal_build,
        "account_login": account_login,
        "timestamp": int(time.time() * 1000)
    }

@app.get("/account")
def get_account():
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 Python driver not active on this host")
    account = mt5.account_info()
    if not account:
        raise HTTPException(status_code=502, detail=f"Failed to fetch account: {mt5.last_error()}")
    return {
        "login": account.login,
        "balance": account.balance,
        "equity": account.equity,
        "margin": account.margin,
        "margin_free": account.margin_free,
        "leverage": account.leverage,
        "currency": account.currency
    }

@app.get("/symbol_info/{symbol}")
def get_symbol_info(symbol: str):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 Python driver not active")
    info = mt5.symbol_info(symbol)
    if not info:
        raise HTTPException(status_code=404, detail=f"Symbol {symbol} not found: {mt5.last_error()}")
    tick = mt5.symbol_info_tick(symbol)
    return {
        "symbol": info.name,
        "bid": tick.bid if tick else info.bid,
        "ask": tick.ask if tick else info.ask,
        "point": info.point,
        "digits": info.digits,
        "spread": info.spread,
        "trade_contract_size": info.trade_contract_size,
    }

@app.post("/order_send")
def send_order(req: OrderRequestModel):
    """
    Executes real mt5.order_send() using TRADE_ACTION_DEAL
    """
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 Python driver not active on this host")

    symbol_info = mt5.symbol_info(req.symbol)
    if not symbol_info:
        raise HTTPException(status_code=400, detail=f"Symbol {req.symbol} not found")

    if not symbol_info.visible:
        if not mt5.symbol_select(req.symbol, True):
            raise HTTPException(status_code=400, detail=f"Failed to select symbol {req.symbol}")

    tick = mt5.symbol_info_tick(req.symbol)
    if not tick:
        raise HTTPException(status_code=500, detail="Failed to retrieve latest tick")

    order_type = mt5.ORDER_TYPE_BUY if req.action.upper() == "BUY" else mt5.ORDER_TYPE_SELL
    price = tick.ask if req.action.upper() == "BUY" else tick.bid
    if req.price:
        price = req.price

    request_dict = {
        "action": mt5.TRADE_ACTION_DEAL,
        "symbol": req.symbol,
        "volume": float(req.volume),
        "type": order_type,
        "price": float(price),
        "sl": float(req.sl) if req.sl else 0.0,
        "tp": float(req.tp) if req.tp else 0.0,
        "deviation": int(req.deviation),
        "magic": int(req.magic),
        "comment": req.comment,
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    result = mt5.order_send(request_dict)
    if not result:
        raise HTTPException(status_code=500, detail=f"mt5.order_send failed: {mt5.last_error()}")

    # Verify return code
    # mt5.TRADE_RETCODE_DONE == 10009
    success = (result.retcode == mt5.TRADE_RETCODE_DONE)
    return {
        "retcode": result.retcode,
        "retcode_description": "TRADE_RETCODE_DONE" if success else str(result.retcode),
        "ticket": result.order,
        "deal": result.deal,
        "volume": result.volume,
        "price": result.price,
        "bid": result.bid,
        "ask": result.ask,
        "comment": result.comment,
        "success": success
    }

@app.get("/positions")
def get_positions(symbol: Optional[str] = None):
    if not MT5_AVAILABLE:
        return {"positions": []}
    
    positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
    if positions is None:
        return {"positions": []}

    res = []
    for pos in positions:
        res.append({
            "ticket": pos.ticket,
            "time": pos.time,
            "type": "BUY" if pos.type == mt5.ORDER_TYPE_BUY else "SELL",
            "magic": pos.magic,
            "volume": pos.volume,
            "price_open": pos.price_open,
            "sl": pos.sl,
            "tp": pos.tp,
            "price_current": pos.price_current,
            "profit": pos.profit,
            "symbol": pos.symbol,
            "comment": pos.comment
        })
    return {"positions": res}

@app.post("/close_position")
def close_position(req: PositionCloseModel):
    if not MT5_AVAILABLE:
        raise HTTPException(status_code=503, detail="MT5 Python driver not active")

    pos = mt5.positions_get(ticket=req.ticket)
    if not pos or len(pos) == 0:
        raise HTTPException(status_code=404, detail=f"Position with ticket {req.ticket} not found")
    
    position = pos[0]
    close_type = mt5.ORDER_TYPE_SELL if position.type == mt5.ORDER_TYPE_BUY else mt5.ORDER_TYPE_BUY
    tick = mt5.symbol_info_tick(position.symbol)
    if not tick:
        raise HTTPException(status_code=500, detail="Failed to get tick for closing")

    price = tick.bid if close_type == mt5.ORDER_TYPE_SELL else tick.ask

    close_req = {
        "action": mt5.TRADE_ACTION_DEAL,
        "position": position.ticket,
        "symbol": position.symbol,
        "volume": position.volume,
        "type": close_type,
        "price": price,
        "deviation": req.deviation,
        "magic": position.magic,
        "comment": "CloseBySwarm",
        "type_time": mt5.ORDER_TIME_GTC,
        "type_filling": mt5.ORDER_FILLING_IOC,
    }

    res = mt5.order_send(close_req)
    if not res:
        raise HTTPException(status_code=500, detail=f"Failed to close position: {mt5.last_error()}")

    return {
        "success": res.retcode == mt5.TRADE_RETCODE_DONE,
        "retcode": res.retcode,
        "deal": res.deal,
        "order": res.order
    }

if __name__ == "__main__":
    uvicorn.run("mt5_bridge:app", host="127.0.0.1", port=8000, reload=False, log_level="info")
