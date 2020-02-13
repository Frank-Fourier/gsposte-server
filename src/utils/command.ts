import { exec, spawn } from "child_process";

/**
 * Executes a command as a child process of Node. Returns the stdout of the program.
 * Throws with stderr if there was an error while executing the command
 * This function is not suited for commands that return large chunks of data. Use spawnCommand() instead!
 *
 * @param command
 * @returns Promise<string> Promise resolving to standard output
 */
export function executeCommand(command: string): Promise<string> {
    return new Promise(((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) {
                return reject({
                    error: err,
                    stdout: stdout,
                    stderr: stderr
                });
            }
            return resolve(stdout);
        });
    }));
}

/**
 * Spawns a separated child process and executes a command on that. Returns the stdout of the program.
 * Throws with stderr if there was an error while spawning the command
 * This function is more suited for commands that return large amounts of data
 *
 * @param command string Command to be executed
 * @param args string[] Command arguments
 * @returns Promise<string> Promise resolving to standard output
 */
export function spawnCommand(command: string, ...args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const cmd = spawn(command, [ ...args ]);
        let stdout_data = "", stderr_data = "";

        cmd.stdout.setEncoding("utf-8").on('data', (data: string) => {
            stdout_data += data.replace("\n", "");
        });
        cmd.stderr.setEncoding("utf-8").on('data', (data: string) => {
            stderr_data += data.replace("\n", "");
        });
        cmd.stdout.on('end', () => {
            if (!cmd.killed) { cmd.kill("SIGKILL"); }
            if (stdout_data !== "") {
                resolve(stdout_data);
            }
        });
        cmd.stderr.on('end', () => {
            if (!cmd.killed) { cmd.kill("SIGKILL"); }
            if (stderr_data !== "") {
                reject({ error: stderr_data });
            }
        });
    });
}
