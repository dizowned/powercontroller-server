#!/usr/bin/env python3

from asyncio import sleep
from filelock import FileLock
import sys,json,os

def main(self=None):
        
    if len(sys.argv) != 4:
        print("Usage: setchannel.py <controllerid> <channelnumber> <state>")
        sys.exit(1)

    controllerid = int(sys.argv[1])
    channelnumber = int(sys.argv[2])
    state = sys.argv[3].lower() == 'true'

    # Load controller list
    with open('./config/controller-list.json', 'r') as f:
        controllers = json.load(f)

    print(f"Loaded {(controllers)} controllers")

    # Find controller
    controller = next((c for c in controllers if c['id'] == controllerid), None)
    if not controller:
        print(f"Controller {controllerid} not found")
        sys.exit(1)

    # Find channel
    channel = next((ch for ch in controller['channels'] if ch['number'] == channelnumber), None)
    if not channel:
        print(f"Channel {channelnumber} not found in controller {controllerid}")
        sys.exit(1)

    # Set channel state
    channel['state'] = state

    # Save updated controller list
    lock_path="channel_update.lock"
    with FileLock(lock_path, timeout=10):
        file = open('./config/controller-list.json', 'w')
        json.dump(controllers, file, indent=2)
        print(f"Set channel number: {channelnumber} of controller {controllerid} to {'ON' if state else 'OFF'}")
    
    
if __name__ == "__main__":
    main()
