import { createUser } from "./auth.js";
import { initializeDatabase, pool } from "./db.js";

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD to create an account.");
  process.exitCode = 1;
} else {
  try {
    await initializeDatabase();
    const user = await createUser(email, password);
    console.log(`Created CLIFlow user ${user.email}.`);
  } catch (error) {
    console.error(`Unable to create user: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
