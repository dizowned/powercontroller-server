#!/usr/bin/env python3

import sys,json,os

def main(self=None):

    if len(sys.argv) != 4:
        print("Usage: setchannel.py <controllerid> <channelname> <state>")
        sys.exit(1)

    controllerid = sys.argv[1]
    channelname = sys.argv[2]
    state = sys.argv[3].lower() == 'true'

    # Load controller list
    with open('../data/controller-list.json', 'r') as f:
        controllers = json.load(f)

    # Find controller
    controller = next((c for c in controllers if c['id'] == controllerid), None)
    if not controller:
        print(f"Controller {controllerid} not found")
        sys.exit(1)

    # Find channel
    channel = next((ch for ch in controller['channels'] if ch['name'] == channelname), None)
    if not channel:
        print(f"Channel {channelname} not found in controller {controllerid}")
        sys.exit(1)

    # Set channel state
    channel['state'] = state

    # Save updated controller list
    with open('../data/controller-list.json', 'w') as f:
        json.dump(controllers, f, indent=2)

    print(f"Set channel {channelname} of controller {controllerid} to {'ON' if state else 'OFF'}")
    
    
if __name__ == "__main__":
    main()
