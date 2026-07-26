export function getCustomerSessionId(): string {
  if (typeof window === "undefined") return "server-session";
  
  let sessionId = localStorage.getItem("plateiq_customer_session_id");
  if (!sessionId) {
    // Generate simple standard UUID or unique random string
    sessionId = "cust_" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    localStorage.setItem("plateiq_customer_session_id", sessionId);
  }
  return sessionId;
}
