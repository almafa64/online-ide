# Online IDE
version: 0.8.3

## Setup
1. npm install
2. docker build . -f docker/Dockerfile -t online-ide-ubuntu
3. node server.js

## External dependencies
(Only for running/compiling programs)
- Python (+pip) - Python
- NodeJs (+npm) - js
- GCC - C/C++

## Known bugs
- Windows
	- No colors in terminal -> By default windows terminal doesn't do any ANSI escapes so no colors will be displayed
	- Repeated lines after resizing the browser from narrow to wide -> I have no clue
- Linux
	- It's just works

## History
We had a school project that required online code sharing, writing and running, so we picked [online gdb](https://www.onlinegdb.com) and [replit](https://replit.com/).

The problem is that replit recently changed how you can run a project so we coulnd't use that anymore, and online gdb has a maximum of 100kb file size limit.

This is where this project of mine comes in, if the teacher hadn't found another solution. But nonetheless I continue this because it's an interesting project and there is not enough open source online IDE.