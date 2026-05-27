async function request(path, options) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export const api = {
  authConfig: () => request("/api/auth/config"),
  me: () => request("/api/auth/me"),
  login: (credentials) => request("/api/auth/login", { method: "POST", body: JSON.stringify(credentials) }),
  register: (credentials) => request("/api/auth/register", { method: "POST", body: JSON.stringify(credentials) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
  list: () => request("/api/workflows"),
  get: (id) => request(`/api/workflows/${id}`),
  create: (workflow) => request("/api/workflows", { method: "POST", body: JSON.stringify(workflow) }),
  update: (id, workflow) => request(`/api/workflows/${id}`, { method: "PUT", body: JSON.stringify(workflow) }),
  remove: (id) => request(`/api/workflows/${id}`, { method: "DELETE" }),
  run: (id) => request(`/api/workflows/${id}/run`, { method: "POST" }),
  cancel: (id) => request(`/api/executions/${id}/cancel`, { method: "POST" }),
};
