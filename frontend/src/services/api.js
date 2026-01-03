import axios from "axios";

const TOKEN_KEY = "ksc_token";

const api = axios.create({
  baseURL: "http://localhost:5000/api",
});

const readToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(error)
);

export { TOKEN_KEY };
export default api;
