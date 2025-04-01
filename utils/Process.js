const { spawn } = require('node:child_process');
const path = require('path');

process.env.path += ";C:\\MongoDB\\bin";
process.env.path += ";C:\\MySQL\\bin";

class Process {
    constructor(executable, options = {}) {
        this.executable = executable;
        this.process = null;
        this.process_arguments = [];
        this.options = options;
        this.exit_code = null;
        this.errors = "";
        this.outs = "";
        this.start_time = null;
        this.end_time = null;
        this.finish = false;
    }

    get ProcessArguments() {
        return this.process_arguments;
    }

    get Options() {
        return this.options;
    }

    get ExitCode() {
        return this.exit_code;
    }

    get ErrorsLog() {
        return this.errors;
    }

    get Logs() {
        return this.outs;
    }

    get StartTime() {
        return this.start_time;
    }

    get EndTime() {
        return this.end_time;
    }

    set ProcessArguments(value) {
        this.process_arguments = value;
    }

    set Options(value) {
        this.options = value;
    }

    async ExecuteAsync(forceTimer = false) {
        return new Promise((resolve, reject) => {
            this.process = spawn(this.executable, this.process_arguments, this.options);
            if (forceTimer) {
                this.start_time = Date.now();
            }

            this.process.stdout.on("data", (chunk) => {
                this.outs += chunk.toString();
            });

            this.process.stderr.on("data", (chunk) => {
                const text = chunk.toString();
                this.errors += text;
                this.outs += text;
            });

            this.process.on('close', (code) => {
                this.exit_code = code;
                this.end_time = Date.now();
                this.finish = true;
                resolve(true);
            });

            this.process.on('error', (err) => {
                const text = err.toString();
                this.errors += text;
                this.outs += text;
                reject(err);
            });
        });
    }

    Execute(forceTimer = false) {
        this.process = spawn(this.executable, this.process_arguments, this.options);
        if (forceTimer) {
            this.start_time = Date.now();
        }

        this.process.stdout.on("data", (chunk) => {
            this.outs += chunk.toString();
        });

        this.process.stderr.on("data", (chunk) => {
            const text = chunk.toString();
            this.errors += text;
            this.outs += text;
        });

        this.process.on('close', (code) => {
            this.exit_code = code;
            this.end_time = Date.now();
            this.finish = true;
        });

        this.process.on('error', (err) => {
            const text = err.toString();
            this.errors += text;
            this.outs += text;
        });
    }

    Write(cmd) {
        if (this.start_time === null) {
            this.start_time = Date.now();
        }
        this.process.stdin.write(cmd);
    }

    End() {
        this.process.stdin.end();
    }

    async Finish() {
        return new Promise((resolve) => {
            const check = () => {
                if (this.finish) {
                    resolve(true);
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }
}

module.exports = Process;