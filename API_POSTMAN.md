```json
{
  "info": {
    "name": "yes-time API (frontend) - Postman-like",
    "version": "1.0.1",
    "baseUrl": "http://localhost:3000"
  },
  "auth": {
    "type": "bearer",
    "header": "Authorization: Bearer <token>",
    "notes": "Include the Authorization header for endpoints with `authRequired: true`."
  },
  "endpoints": [
    { "name": "Health", "method": "GET", "url": "/", "authRequired": false, "description": "Health / hello" },

    {
      "name": "Signup",
      "method": "POST",
      "url": "/auth/signup",
      "authRequired": false,
      "description": "Multipart form - signup with optional files",
      "contentType": "multipart/form-data",
      "multipartFields": ["cnicFront (file)", "cnicBack (file)"],
      "bodyDto": "server/src/auth/dto/signup.dto.ts",
      "requiredFields": [
        { "name": "name", "type": "string" },
        { "name": "email", "type": "string (email)" },
        { "name": "phone", "type": "string" },
        { "name": "password", "type": "string" }
      ],
      "optionalFields": [
        { "name": "cnicFront (file)", "type": "file" },
        { "name": "cnicBack (file)", "type": "file" }
      ]
    },

    { "name": "Verify OTP", "method": "POST", "url": "/auth/verify-otp", "authRequired": false, "body": { "email": "string", "otp": "string" }, "requiredFields": ["email","otp"] },
    { "name": "Resend OTP", "method": "POST", "url": "/auth/resend-otp", "authRequired": false, "body": { "email": "string" }, "requiredFields": ["email"] },
    { "name": "Login", "method": "POST", "url": "/auth/login", "authRequired": false, "bodyDto": "server/src/auth/dto/login.dto.ts", "requiredFields": ["email","password"] },
    { "name": "Refresh Token", "method": "POST", "url": "/auth/refresh", "authRequired": false, "bodyDto": "server/src/auth/dto/refresh.dto.ts", "requiredFields": ["refreshToken"] },
    { "name": "Logout", "method": "POST", "url": "/auth/logout", "authRequired": true },
    { "name": "Change Password", "method": "POST", "url": "/auth/change-password", "authRequired": true, "body": { "currentPassword": "string", "newPassword": "string" }, "requiredFields": ["currentPassword","newPassword"] },
    { "name": "Select Role", "method": "POST", "url": "/auth/select-role", "authRequired": true, "body": { "role": "string", "shopName?": "string", "shopLocation?": "string", "shopType?": "string", "shopDescription?": "string" }, "requiredFields": ["role"] },

    { "name": "Get My Balance", "method": "GET", "url": "/wallet/my-balance", "authRequired": true },
    { "name": "Add Balance (Top-up)", "method": "POST", "url": "/wallet/add-balance", "authRequired": true, "body": { "amount": "number (PKR, >0, <=100000)" }, "requiredFields": ["amount"] },
    { "name": "My Transactions", "method": "GET", "url": "/wallet/my-transactions", "authRequired": true, "query": "See server/src/wallet/dto/transaction.dto.ts for filters" },

    { "name": "Join Car Participation", "method": "POST", "url": "/car-participation/join", "authRequired": true, "body": { "referredByUserId?": "string" } },
    { "name": "My Participation", "method": "GET", "url": "/car-participation/my-participation", "authRequired": true },
    { "name": "All Participations", "method": "GET", "url": "/car-participation/all-participations", "authRequired": false },

    {
      "name": "Create Car Contribution",
      "method": "POST",
      "url": "/car-contributions",
      "authRequired": true,
      "bodyDto": "server/src/car-contributions/dto/car-contribution.dto.ts",
      "requiredFields": [
        { "name": "participationId", "type": "string (MongoId)" },
        { "name": "amount", "type": "number (>=0)" }
      ]
    },
    { "name": "My Contributions", "method": "GET", "url": "/car-contributions/my", "authRequired": true },
    { "name": "Contribution Stats", "method": "GET", "url": "/car-contributions/stats", "authRequired": true },

    { "name": "Car Winner - Next Draw", "method": "GET", "url": "/", "authRequired": false },
    { "name": "Car Winner - All", "method": "GET", "url": "/car-winner/all", "authRequired": false },
    { "name": "Car Winner - Draw History", "method": "GET", "url": "/car-winner/draw-history", "authRequired": false, "query": { "limit?": "number" } },
    { "name": "Car Winner - Stats", "method": "GET", "url": "/car-winner/stats", "authRequired": false },

    { "name": "Pay Registration Lottery", "method": "POST", "url": "/registration-lottery/pay", "authRequired": true },
    { "name": "My Lottery Info", "method": "GET", "url": "/registration-lottery/my-info", "authRequired": true },
    { "name": "Lottery Dashboard Stats", "method": "GET", "url": "/registration-lottery/dashboard-stats", "authRequired": true },
    { "name": "Lottery Draw History", "method": "GET", "url": "/registration-lottery/draw-history", "authRequired": false, "query": { "limit?": "number" } },
    { "name": "Lottery Next Draw", "method": "GET", "url": "/registration-lottery/next-draw", "authRequired": false },
    { "name": "Lottery Winning History", "method": "GET", "url": "/registration-lottery/winning-history", "authRequired": true },
    { "name": "Lottery Trigger Draw", "method": "POST", "url": "/registration-lottery/trigger-draw", "authRequired": true },
    { "name": "Lottery Notifications", "method": "GET", "url": "/registration-lottery/notifications", "authRequired": true, "query": { "limit?": "number" } },
    { "name": "Lottery Unread Count", "method": "GET", "url": "/registration-lottery/notifications/unread-count", "authRequired": true },
    { "name": "Lottery Mark Notification Read", "method": "POST", "url": "/registration-lottery/notifications/:id/read", "authRequired": true, "params": { "id": "string" } },
    { "name": "Lottery Mark All Read", "method": "POST", "url": "/registration-lottery/notifications/mark-all-read", "authRequired": true },
    { "name": "Lottery Delete Notification", "method": "DELETE", "url": "/registration-lottery/notifications/:id", "authRequired": true, "params": { "id": "string" } },

    { "name": "Game Join", "method": "POST", "url": "/game/join", "authRequired": true },
    { "name": "Game Daily Payment", "method": "POST", "url": "/game/daily-payment", "authRequired": true },
    { "name": "Game Active Cycle", "method": "GET", "url": "/game/active-cycle", "authRequired": true },
    { "name": "Game Savings", "method": "GET", "url": "/game/savings", "authRequired": true },
    { "name": "Game Coupons", "method": "GET", "url": "/game/coupons", "authRequired": true },
    { "name": "Game Payment History", "method": "GET", "url": "/game/payment-history", "authRequired": true, "query": { "limit?": "number", "page?": "number" } },
    { "name": "Game Dashboard Stats", "method": "GET", "url": "/game/dashboard-stats", "authRequired": true },
    { "name": "Game Draw History", "method": "GET", "url": "/game/draw-history", "authRequired": false, "query": { "limit?": "number" } },
    { "name": "Game Next Draw", "method": "GET", "url": "/game/next-draw", "authRequired": false },
    { "name": "Game Winning History", "method": "GET", "url": "/game/winning-history", "authRequired": true },
    { "name": "Game Trigger Draw", "method": "POST", "url": "/game/trigger-draw", "authRequired": true },
    { "name": "Game Notifications", "method": "GET", "url": "/game/notifications", "authRequired": true, "query": { "limit?": "number" } },
    { "name": "Game Unread Count", "method": "GET", "url": "/game/notifications/unread-count", "authRequired": true },
    { "name": "Game Mark Notification Read", "method": "POST", "url": "/game/notifications/:id/read", "authRequired": true, "params": { "id": "string" } },
    { "name": "Game Mark All Read", "method": "POST", "url": "/game/notifications/mark-all-read", "authRequired": true },
    { "name": "Game Delete Notification", "method": "DELETE", "url": "/game/notifications/:id", "authRequired": true, "params": { "id": "string" } },

    {
      "name": "Cashback - Request Shopkeeper",
      "method": "POST",
      "url": "/cashback/shopkeeper/request",
      "authRequired": true,
      "role": "user",
      "bodyDto": "server/src/cashback/dto/cashback.dto.ts",
      "requiredFields": [
        { "name": "shopName", "type": "string" },
        { "name": "ownerName", "type": "string" },
        { "name": "phone", "type": "string" }
      ],
      "optionalFields": [ { "name": "address", "type": "string" } ],
      "description": "Submit a request to become a shopkeeper. NO FEE CHARGED YET. Registration fee PKR 1500 will be charged AFTER admin approval.",
      "businessLogic": "STEP 1 (User Request): (1) Shopkeeper record created with status='pending', isRegistrationPaid=false. (2) User.role stays 'user', shopkeeperStatus='pending'. (3) NO FEE DEDUCTED YET. (4) Request sent to admin dashboard. STEP 2 (Admin Approval): (1) Admin reviews request. (2) Admin checks user wallet balance (need PKR 1500). (3) Fee deducted from wallet upon approval. (4) Shopkeeper status→'active', isRegistrationPaid=true. (5) User.role→'shopkeeper', shopkeeperStatus→'approved'. (6) User can now record purchases. If Rejected: User can reapply, no fee lost.",
      "responseNotes": "NO FEE DEDUCTED. shopkeeperStatus='pending'. isRegistrationPaid=false. User.role remains 'user'. Message: 'Awaiting admin approval. Fee will be charged upon approval.' After admin approval: status='active', isRegistrationPaid=true, User.role='shopkeeper'. If rejected: can reapply (still no fee lost).",
      "errors": { "Already has request": "Status is 'pending' or 'active'. Contact admin.", "Commission error": "If issues with later purchase recording" }
    },
    {
      "name": "Cashback - Approve Shopkeeper (Admin Only)",
      "method": "POST",
      "url": "/cashback/shopkeeper/:id/approve",
      "authRequired": true,
      "role": "admin",
      "requiredParams": [ { "name": "id", "type": "string (MongoId)" } ],
      "description": "Admin approves a pending shopkeeper request. Charges registration fee at this point.",
      "businessLogic": "(1) Find shopkeeper with status='pending'. (2) Check user wallet balance (need PKR 1500). (3) Deduct fee from wallet. (4) Set shopkeeper.status='active', isRegistrationPaid=true. (5) Update user.role→'shopkeeper', shopkeeperStatus→'approved'. (6) Send approval notification to user.",
      "responseNotes": "Fee: PKR 1500 deducted from user wallet. Shopkeeper status='active'. User role='shopkeeper'. User can now record purchases.",
      "errors": { "Not in pending status": "Only pending requests can be approved.", "Insufficient wallet": "User must top up wallet to PKR 1500+ before approval can happen." }
    },
    {
      "name": "Cashback - Register Shopkeeper Admin (Admin Only - DEPRECATED)",
      "method": "POST",
      "url": "/cashback/shopkeeper/register-admin/:userId",
      "authRequired": true,
      "role": "admin",
      "bodyDto": "server/src/cashback/dto/cashback.dto.ts",
      "requiredParams": [ { "name": "userId", "type": "string (MongoId)" } ],
      "requiredFields": ["shopName","ownerName","phone"],
      "description": "DEPRECATED - For admin migrations only. Directly creates active shopkeeper, bypassing approval workflow. Do NOT use for normal registrations.",
      "businessLogic": "(1) Admin only. (2) Wallet balance checked, fee deducted. (3) Shopkeeper: status='active', isRegistrationPaid=true. (4) User.role='shopkeeper' immediately. (5) No pending request stage. FOR MIGRATIONS ONLY.",
      "responseNotes": "Fee deducted. Status='active'. User.role='shopkeeper' immediately. DO NOT USE FOR NORMAL REGISTRATIONS - use approval workflow.",
      "warnings": "DEPRECATED - This endpoint bypasses the normal approval workflow. Should only be used for admin-initiated migrations or special cases."
    },
    { "name": "Cashback - My Shop", "method": "GET", "url": "/cashback/shopkeeper/my-shop", "authRequired": true, "role": "shopkeeper" },
    { "name": "Cashback - Get Shopkeeper By ID", "method": "GET", "url": "/cashback/shopkeeper/:id", "authRequired": true, "role": "user", "params": { "id": "string" } },
    {
      "name": "Cashback - Record Purchase",
      "method": "POST",
      "url": "/cashback/purchase",
      "authRequired": true,
      "role": "shopkeeper",
      "bodyDto": "server/src/cashback/dto/cashback.dto.ts",
      "requiredFields": [
        { "name": "customerCoupon", "type": "string" },
        { "name": "amount", "type": "number (>=1)" }
      ],
      "optionalFields": [
        { "name": "shopkeeperId", "type": "string (MongoId) — optional" },
        { "name": "description", "type": "string" }
      ],
      "description": "Record a customer purchase. Requires user.role='shopkeeper' AND shopkeeper.status='active'.",
      "businessLogic": "(1) Verify user.role='shopkeeper'. (2) Find shopkeeper: status='active' required. (3) Find customer cycle by coupon (active/completed/won). (4) Commission (2.5%) deducted from shopkeeper wallet. (5) Full amount added to customer cycle. (6) At level 30: cycle becomes permanent.",
      "example": {
        "body": {
          "customerCoupon": "123456",
          "amount": 500,
          "description": "Grocery"
        }
      }
    },
    { "name": "Cashback - My Purchases", "method": "GET", "url": "/cashback/purchases/my", "authRequired": true, "role": "customer", "query": { "limit?": "number" } },
    { "name": "Cashback - Shopkeeper Sales Overview", "method": "GET", "url": "/cashback/shopkeeper/sales-overview", "authRequired": true, "role": "shopkeeper", "query": { "range?": "daily|monthly|yearly", "start?": "YYYY-MM-DD", "end?": "YYYY-MM-DD" }, "description": "Aggregated sales for graphing: returns array of {period, totalSales, totalCommission, count}" },
    { "name": "Cashback - Shop Purchases", "method": "GET", "url": "/cashback/purchases/shop/:shopkeeperId", "authRequired": true, "role": "shopkeeper|admin", "params": { "shopkeeperId": "string" } },
    { "name": "Cashback - Shopkeeper Purchases", "method": "GET", "url": "/cashback/purchases/shopkeeper/:shopkeeperId", "authRequired": true, "role": "shopkeeper", "params": { "shopkeeperId": "string" } },
    { "name": "Cashback - Join", "method": "POST", "url": "/cashback/join", "authRequired": true, "role": "customer" },
    { "name": "Cashback - Active Cycle", "method": "GET", "url": "/cashback/active-cycle", "authRequired": true, "role": "customer" },
    { "name": "Cashback - My Cycles", "method": "GET", "url": "/cashback/my-cycles", "authRequired": true, "role": "customer" },
    { "name": "Cashback - Commitment Table", "method": "GET", "url": "/cashback/commitment-table", "authRequired": true, "role": "customer" },
    { "name": "Cashback - Draw History", "method": "GET", "url": "/cashback/draw/history", "authRequired": false, "role": "public" },
    { "name": "Cashback - Next Draw", "method": "GET", "url": "/cashback/draw/next", "authRequired": false, "role": "public", "description": "Get information about the next upcoming cashback draw", "responseNotes": "serverTime: Current server time. nextDrawTime: Scheduled time for the next draw. countdown: Seconds until next draw. drawNumber: Sequence number of the next draw. totalParticipants: Number of eligible participants (only counts active cycles at level >= 1 + permanent completed cycles). lastDraw: Details of the most recently completed draw, or null if no draws have been executed yet. Note: If totalParticipants is 0, the draw will execute but will have no winner." },
    { "name": "Cashback - Winning History", "method": "GET", "url": "/cashback/draw/winning-history", "authRequired": true, "role": "customer" },
    { "name": "Cashback - Dashboard Stats", "method": "GET", "url": "/cashback/dashboard-stats", "authRequired": true, "role": "user" },
    { "name": "Cashback - Notifications", "method": "GET", "url": "/cashback/notifications", "authRequired": true, "role": "user", "query": { "limit?": "number" } },
    { "name": "Cashback - Unread Count", "method": "GET", "url": "/cashback/notifications/unread-count", "authRequired": true, "role": "user" },
    { "name": "Cashback - Mark Notification Read", "method": "POST", "url": "/cashback/notifications/:id/read", "authRequired": true, "role": "user", "params": { "id": "string" } },
    { "name": "Cashback - Mark All Read", "method": "POST", "url": "/cashback/notifications/mark-all-read", "authRequired": true, "role": "user" },
    { "name": "Cashback - Delete Notification", "method": "DELETE", "url": "/cashback/notifications/:id", "authRequired": true, "role": "user", "params": { "id": "string" } },

    { "name": "Profile - Get Me", "method": "GET", "url": "/profile/me", "authRequired": true },
    {
      "name": "Profile - Update",
      "method": "PUT",
      "url": "/profile/update",
      "authRequired": true,
      "contentType": "multipart/form-data",
      "multipartFields": ["profileImage (file)"],
      "bodyDto": "server/src/profile/dto/update-profile.dto.ts",
      "requiredFields": [],
      "optionalFields": ["name","email","profileImage (file)"]
    }
  ]
}
```
