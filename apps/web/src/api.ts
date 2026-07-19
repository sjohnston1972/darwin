const operatorTokenKey = 'darwin:operator-token';

export const getOperatorToken = () =>
  window.sessionStorage.getItem(operatorTokenKey)?.trim() || null;

export const setOperatorToken = (token: string | null) => {
  if (token) window.sessionStorage.setItem(operatorTokenKey, token.trim());
  else window.sessionStorage.removeItem(operatorTokenKey);
};

export const apiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
) => {
  const token = getOperatorToken();
  let response: Response;
  if (token) {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${token}`);
    response = await fetch(input, { ...init, headers });
  } else {
    response = init ? await fetch(input, init) : await fetch(input);
  }
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent('darwin:operator-unauthorized'));
  }
  return response;
};
