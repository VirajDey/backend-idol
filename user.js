import postgres from "postgres";
import crypto from "crypto";

// CORS helper function
function withCORS(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { 
    status: response.status,
    statusText: response.statusText,
    headers 
  });
}

// Database connection helper
async function getSQL(env) {
  if (env.HYPERDRIVE && env.HYPERDRIVE.connectionString) {
    return postgres(env.HYPERDRIVE.connectionString, { fetch_types: false });
  }
  return null;
}

// Password hashing functions
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hashedPassword) {
  return hashPassword(password) === hashedPassword;
}

// JWT-like token generation (simple base64 for demo)
function generateToken(userId, username) {
  const payload = {
    userId,
    username,
    timestamp: Date.now(),
    expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  };
  return btoa(JSON.stringify(payload));
}

function validateToken(token) {
  try {
    const decoded = JSON.parse(atob(token));
    if (Date.now() > decoded.expires) {
      return null;
    }
    return decoded;
  } catch (e) {
    return null;
  }
}

// Generate 2FA code (6 digits)
function generate2FACode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Verify 2FA code
function verify2FACode(inputCode, storedCode) {
  return inputCode === storedCode;
}

// Authentication middleware
async function authenticateUser(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.substring(7);
  const decoded = validateToken(token);
  return decoded;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return withCORS(new Response(null, { status: 204 }));
    }

    const sql = await getSQL(env);
    if (!sql) {
      return withCORS(new Response(JSON.stringify({ error: "Database connection unavailable" }), { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }));
    }

    try {
      // User Registration
      if (pathname === "/api/auth/register" && request.method === "POST") {
        const body = await request.json();
        const { username, email, password, wallet, two_fa_enabled = false } = body;

        if (!username || !email || !password) {
          return withCORS(new Response(JSON.stringify({ error: "Username, email, and password are required" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check if user already exists
        const existingUser = await sql`SELECT id FROM users WHERE email = ${email} OR username = ${username}`;
        if (existingUser.length > 0) {
          return withCORS(new Response(JSON.stringify({ error: "User with this email or username already exists" }), { 
            status: 409, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Generate 2FA code if 2FA is enabled
        let twoFACode = null;
        if (two_fa_enabled) {
          twoFACode = generate2FACode();
        }

        // Create new user
        const hashedPassword = hashPassword(password);
        const newUser = await sql`
          INSERT INTO users (username, email, password, wallet, status, verified, credits, two_fa_enabled, two_fa_code)
          VALUES (${username}, ${email}, ${hashedPassword}, ${wallet || null}, 'active', false, 0, ${two_fa_enabled}, ${twoFACode})
          RETURNING id, username, email, wallet, status, verified, credits, joined_date, two_fa_enabled, created_at
        `;

        const token = generateToken(newUser[0].id, newUser[0].username);
        
        const response = {
          user: newUser[0], 
          token,
          message: "Registration successful"
        };

        // Include 2FA code in response if enabled
        if (two_fa_enabled && twoFACode) {
          response.twoFACode = twoFACode;
          response.message = "Registration successful. Please save your 2FA code: " + twoFACode;
        }
        
        return withCORS(new Response(JSON.stringify(response), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Admin Registration
      if (pathname === "/api/auth/admin/register" && request.method === "POST") {
        const body = await request.json();
        const { email, password, two_fa_enabled = false } = body;

        if (!email || !password) {
          return withCORS(new Response(JSON.stringify({ error: "Email and password are required" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check if admin already exists
        const existingAdmin = await sql`SELECT id FROM admins WHERE email = ${email}`;
        if (existingAdmin.length > 0) {
          return withCORS(new Response(JSON.stringify({ error: "Admin with this email already exists" }), { 
            status: 409, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Generate 2FA code if 2FA is enabled
        let twoFACode = null;
        if (two_fa_enabled) {
          twoFACode = generate2FACode();
        }

        // Create new admin
        const hashedPassword = hashPassword(password);
        const newAdmin = await sql`
          INSERT INTO admins (email, password, two_fa_code)
          VALUES (${email}, ${hashedPassword}, ${twoFACode})
          RETURNING id, email, created_at
        `;

        const token = generateToken(newAdmin[0].id, newAdmin[0].email);
        
        const response = {
          admin: newAdmin[0], 
          token,
          message: "Admin registration successful"
        };

        // Include 2FA code in response if enabled
        if (two_fa_enabled && twoFACode) {
          response.twoFACode = twoFACode;
          response.message = "Admin registration successful. Please save your 2FA code: " + twoFACode;
        }
        
        return withCORS(new Response(JSON.stringify(response), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Admin Login
      if (pathname === "/api/auth/admin/login" && request.method === "POST") {
        const body = await request.json();
        const { email, password, twoFACode } = body;

        if (!email || !password) {
          return withCORS(new Response(JSON.stringify({ error: "Email and password are required" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Find admin by email
        const admins = await sql`SELECT * FROM admins WHERE email = ${email}`;
        if (admins.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "Invalid credentials" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const admin = admins[0];

        // Verify password
        if (!verifyPassword(password, admin.password)) {
          return withCORS(new Response(JSON.stringify({ error: "Invalid credentials" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check 2FA if enabled
        if (admin.two_fa_code) {
          if (!twoFACode) {
            return withCORS(new Response(JSON.stringify({ 
              error: "2FA code required",
              requires2FA: true,
              message: "Please provide your 2FA code"
            }), { 
              status: 401, 
              headers: { "Content-Type": "application/json" } 
            }));
          }

          // Verify 2FA code
          if (!verify2FACode(twoFACode, admin.two_fa_code)) {
            return withCORS(new Response(JSON.stringify({ error: "Invalid 2FA code" }), { 
              status: 401, 
              headers: { "Content-Type": "application/json" } 
            }));
          }
        }

        // Remove password and 2FA code from response
        const { password: _, two_fa_code: __, ...adminWithoutPassword } = admin;
        const token = generateToken(admin.id, admin.email);

        return withCORS(new Response(JSON.stringify({ 
          admin: adminWithoutPassword, 
          token,
          message: "Admin login successful" 
        }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // User Login
      if (pathname === "/api/auth/login" && request.method === "POST") {
        const body = await request.json();
        const { email, password, twoFACode } = body;

        if (!email || !password) {
          return withCORS(new Response(JSON.stringify({ error: "Email and password are required" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Find user by email
        const users = await sql`SELECT * FROM users WHERE email = ${email}`;
        if (users.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "Invalid credentials" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const user = users[0];

        // Check if user is suspended
        if (user.status === 'suspended') {
          return withCORS(new Response(JSON.stringify({ error: "Account is suspended" }), { 
            status: 403, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Verify password
        if (!verifyPassword(password, user.password)) {
          return withCORS(new Response(JSON.stringify({ error: "Invalid credentials" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check 2FA if enabled
        if (user.two_fa_enabled) {
          if (!twoFACode) {
            return withCORS(new Response(JSON.stringify({ 
              error: "2FA code required",
              requires2FA: true,
              message: "Please provide your 2FA code"
            }), { 
              status: 401, 
              headers: { "Content-Type": "application/json" } 
            }));
          }

          // Verify 2FA code
          if (!verify2FACode(twoFACode, user.two_fa_code)) {
            return withCORS(new Response(JSON.stringify({ error: "Invalid 2FA code" }), { 
              status: 401, 
              headers: { "Content-Type": "application/json" } 
            }));
          }
        }

        // Remove password and 2FA code from response
        const { password: _, two_fa_code: __, ...userWithoutPassword } = user;
        const token = generateToken(user.id, user.username);

        return withCORS(new Response(JSON.stringify({ 
          user: userWithoutPassword, 
          token,
          message: "Login successful" 
        }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Get Current User/Admin Profile
      if (pathname === "/api/auth/me" && request.method === "GET") {
        const decoded = await authenticateUser(request);
        if (!decoded) {
          return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check if it's an admin
        const admins = await sql`SELECT * FROM admins WHERE id = ${decoded.userId}`;
        if (admins.length > 0) {
          const { password: _, two_fa_code: __, ...adminWithoutPassword } = admins[0];
          return withCORS(new Response(JSON.stringify({ admin: adminWithoutPassword }), { 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check if it's a user
        const users = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
        if (users.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "User not found" }), { 
            status: 404, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const { password: _, two_fa_code: __, ...userWithoutPassword } = users[0];
        return withCORS(new Response(JSON.stringify({ user: userWithoutPassword }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Update User Profile
      if (pathname === "/api/auth/profile" && request.method === "PUT") {
        const decoded = await authenticateUser(request);
        if (!decoded) {
          return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const body = await request.json();
        const { username, email, wallet, two_fa_enabled } = body;

        // Check if new username/email already exists
        if (username || email) {
          const existingUser = await sql`
            SELECT id FROM users 
            WHERE (email = ${email} OR username = ${username}) AND id != ${decoded.userId}
          `;
          if (existingUser.length > 0) {
            return withCORS(new Response(JSON.stringify({ error: "Username or email already taken" }), { 
              status: 409, 
              headers: { "Content-Type": "application/json" } 
            }));
          }
        }

        // Update user
        const updateFields = [];
        const updateValues = [];
        
        if (username) {
          updateFields.push('username = $' + (updateValues.length + 1));
          updateValues.push(username);
        }
        if (email) {
          updateFields.push('email = $' + (updateValues.length + 1));
          updateValues.push(email);
        }
        if (wallet !== undefined) {
          updateFields.push('wallet = $' + (updateValues.length + 1));
          updateValues.push(wallet);
        }
        if (two_fa_enabled !== undefined) {
          updateFields.push('two_fa_enabled = $' + (updateValues.length + 1));
          updateValues.push(two_fa_enabled);
        }

        if (updateFields.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "No fields to update" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        updateValues.push(decoded.userId);
        const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${updateValues.length} RETURNING *`;
        
        const updatedUsers = await sql.unsafe(query, updateValues);
        const { password: _, ...userWithoutPassword } = updatedUsers[0];

        return withCORS(new Response(JSON.stringify({ 
          user: userWithoutPassword,
          message: "Profile updated successfully" 
        }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Change Password
      if (pathname === "/api/auth/change-password" && request.method === "POST") {
        const decoded = await authenticateUser(request);
        if (!decoded) {
          return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const body = await request.json();
        const { currentPassword, newPassword } = body;

        if (!currentPassword || !newPassword) {
          return withCORS(new Response(JSON.stringify({ error: "Current and new password are required" }), { 
            status: 400, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Get current user
        const users = await sql`SELECT password FROM users WHERE id = ${decoded.userId}`;
        if (users.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "User not found" }), { 
            status: 404, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Verify current password
        if (!verifyPassword(currentPassword, users[0].password)) {
          return withCORS(new Response(JSON.stringify({ error: "Current password is incorrect" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Update password
        const hashedNewPassword = hashPassword(newPassword);
        await sql`UPDATE users SET password = ${hashedNewPassword} WHERE id = ${decoded.userId}`;

        return withCORS(new Response(JSON.stringify({ message: "Password changed successfully" }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Logout
      if (pathname === "/api/auth/logout" && request.method === "POST") {
        return withCORS(new Response(JSON.stringify({ message: "Logout successful" }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Admin: Get All Users
      if (pathname === "/api/admin/users" && request.method === "GET") {
        const decoded = await authenticateUser(request);
        if (!decoded) {
          return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check if user is admin (you might want to add an admin field to your table)
        const adminUsers = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
        if (adminUsers.length === 0 || adminUsers[0].status !== 'active') {
          return withCORS(new Response(JSON.stringify({ error: "Admin access required" }), { 
            status: 403, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const users = await sql`SELECT id, username, email, wallet, status, verified, credits, joined_date, two_fa_enabled, created_at FROM users ORDER BY created_at DESC`;
        
        return withCORS(new Response(JSON.stringify({ users }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Admin: Get Specific User
      const adminUserMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
      if (adminUserMatch && request.method === "GET") {
        const userId = parseInt(adminUserMatch[1], 10);
        const decoded = await authenticateUser(request);
        if (!decoded) {
          return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
            status: 401, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        // Check if user is admin
        const adminUsers = await sql`SELECT * FROM admins WHERE id = ${decoded.userId}`;
        if (adminUsers.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "Admin access required" }), { 
            status: 403, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        const users = await sql`SELECT id, username, email, wallet, status, verified, credits, joined_date, two_fa_enabled, created_at FROM users WHERE id = ${userId}`;
        if (users.length === 0) {
          return withCORS(new Response(JSON.stringify({ error: "User not found" }), { 
            status: 404, 
            headers: { "Content-Type": "application/json" } 
          }));
        }

        return withCORS(new Response(JSON.stringify({ user: users[0] }), { 
          headers: { "Content-Type": "application/json" } 
        }));
      }

          // Admin: Update User Status
    const adminUpdateMatch = pathname.match(/^\/api\/admin\/users\/(\d+)\/status$/);
    if (adminUpdateMatch && request.method === "PUT") {
      const userId = parseInt(adminUpdateMatch[1], 10);
      const decoded = await authenticateUser(request);
      if (!decoded) {
        return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
          status: 401, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Check if user is admin
      const adminUsers = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
      if (adminUsers.length === 0 || adminUsers[0].status !== 'active') {
        return withCORS(new Response(JSON.stringify({ error: "Admin access required" }), { 
          status: 403, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      const body = await request.json();
      const { status } = body;

      if (!status || !['active', 'suspended'].includes(status)) {
        return withCORS(new Response(JSON.stringify({ error: "Status must be 'active' or 'suspended'" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      const updatedUsers = await sql`UPDATE users SET status = ${status} WHERE id = ${userId} RETURNING id, username, email, wallet, status, verified, credits, joined_date, two_fa_enabled, created_at`;
      
      if (updatedUsers.length === 0) {
        return withCORS(new Response(JSON.stringify({ error: "User not found" }), { 
          status: 404, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      return withCORS(new Response(JSON.stringify({ 
        user: updatedUsers[0],
        message: "User status updated successfully" 
      }), { 
        headers: { "Content-Type": "application/json" } 
      }));
    }

    // Admin: Delete User
    const adminDeleteMatch = pathname.match(/^\/api\/admin\/users\/(\d+)$/);
    if (adminDeleteMatch && request.method === "DELETE") {
      const userId = parseInt(adminDeleteMatch[1], 10);
      const decoded = await authenticateUser(request);
      if (!decoded) {
        return withCORS(new Response(JSON.stringify({ error: "Authentication required" }), { 
          status: 401, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Check if user is admin
      const adminUsers = await sql`SELECT * FROM users WHERE id = ${decoded.userId}`;
      if (adminUsers.length === 0 || adminUsers[0].status !== 'active') {
        return withCORS(new Response(JSON.stringify({ error: "Admin access required" }), { 
          status: 403, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Check if trying to delete self
      if (decoded.userId === userId) {
        return withCORS(new Response(JSON.stringify({ error: "Cannot delete your own account" }), { 
          status: 400, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Check if user exists
      const existingUser = await sql`SELECT id, username, email FROM users WHERE id = ${userId}`;
      if (existingUser.length === 0) {
        return withCORS(new Response(JSON.stringify({ error: "User not found" }), { 
          status: 404, 
          headers: { "Content-Type": "application/json" } 
        }));
      }

      // Delete the user
      await sql`DELETE FROM users WHERE id = ${userId}`;

      return withCORS(new Response(JSON.stringify({ 
        message: "User deleted successfully",
        deletedUser: {
          id: existingUser[0].id,
          username: existingUser[0].username,
          email: existingUser[0].email
        }
      }), { 
        headers: { "Content-Type": "application/json" } 
      }));
    }

      // Not found
      return withCORS(new Response(JSON.stringify({ error: "Endpoint not found" }), { 
        status: 404, 
        headers: { "Content-Type": "application/json" } 
      }));

    } catch (error) {
      console.error('Database error:', error);
      return withCORS(new Response(JSON.stringify({ error: "Database error", details: error.message }), { 
        status: 500, 
        headers: { "Content-Type": "application/json" } 
      }));
    } finally {
      if (sql && sql.end) {
        ctx.waitUntil(sql.end());
      }
    }
  },
}; 