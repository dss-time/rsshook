import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface RequestConfig extends AxiosRequestConfig {
  retryTimes?: number;
  retryDelay?: number;
}

export class RequestError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message);
    this.name = 'RequestError';
  }
}

export class HttpRequest {
  private instance: AxiosInstance;
  private abortController: AbortController;

  constructor(baseURL: string, config?: AxiosRequestConfig) {
    this.instance = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
      ...config,
    });
    this.abortController = new AbortController();
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.instance.interceptors.request.use(config => {
      try {
        const token =
          typeof localStorage !== 'undefined'
            ? localStorage.getItem('token')
            : null;

        if (token?.trim()) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch {
        // localStorage may be unavailable in SSR or private browsing contexts.
      }

      return config;
    });

    this.instance.interceptors.response.use(
      response => {
        const responseData = response.data;

        if (responseData && typeof responseData === 'object') {
          const { code, message, data } = responseData;

          if (code !== undefined && code !== 200) {
            throw new RequestError(message || 'Request failed', code);
          }

          return data !== undefined ? data : responseData;
        }

        return responseData;
      },
      error => Promise.reject(this.handleError(error))
    );
  }

  private handleError(error: unknown): Error {
    if (axios.isCancel(error)) {
      return new Error('Request cancelled');
    }

    if (axios.isAxiosError(error)) {
      const status = error.response?.status ?? 0;
      const data = error.response?.data as { message?: string } | undefined;

      if (error.response) {
        return new RequestError(data?.message || 'Server error', status);
      }

      return new Error(error.message || 'Network error');
    }

    return error instanceof Error ? error : new Error('Network error');
  }

  private async retry<T>(config: RequestConfig): Promise<T> {
    const retryTimes = config.retryTimes ?? 3;
    const retryDelay = config.retryDelay ?? 1000;
    let retryCount = 0;

    while (true) {
      try {
        return await this.instance.request<unknown, T>(config);
      } catch (error) {
        if (retryCount >= retryTimes) {
          throw error;
        }

        retryCount++;
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  public async getRequest<T = unknown>(
    url: string,
    params?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    try {
      return await this.instance.get<unknown, T>(url, {
        params,
        ...config,
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (config?.retryTimes) {
        return this.retry<T>({ ...config, method: 'GET', url, params });
      }

      throw error;
    }
  }

  public async postRequest<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    try {
      return await this.instance.post<unknown, T>(url, data, {
        ...config,
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (config?.retryTimes) {
        return this.retry<T>({ ...config, method: 'POST', url, data });
      }

      throw error;
    }
  }

  public async putRequest<T = unknown>(
    url: string,
    data?: unknown,
    config?: RequestConfig
  ): Promise<T> {
    try {
      return await this.instance.put<unknown, T>(url, data, {
        ...config,
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (config?.retryTimes) {
        return this.retry<T>({ ...config, method: 'PUT', url, data });
      }

      throw error;
    }
  }

  public async deleteRequest<T = unknown>(
    url: string,
    config?: RequestConfig
  ): Promise<T> {
    try {
      return await this.instance.delete<unknown, T>(url, {
        ...config,
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (config?.retryTimes) {
        return this.retry<T>({ ...config, method: 'DELETE', url });
      }

      throw error;
    }
  }

  public async uploadFile<T = unknown>(
    url: string,
    file: File,
    onUploadProgress?: RequestConfig['onUploadProgress'],
    config?: RequestConfig
  ): Promise<T> {
    const formData = new FormData();
    formData.append('file', file);

    try {
      return await this.instance.post<unknown, T>(url, formData, {
        ...config,
        headers: {
          ...config?.headers,
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
        signal: this.abortController.signal,
      });
    } catch (error) {
      if (config?.retryTimes) {
        return this.retry<T>({
          ...config,
          method: 'POST',
          url,
          data: formData,
        });
      }

      throw error;
    }
  }

  public async downloadFile(
    url: string,
    filename: string,
    onDownloadProgress?: RequestConfig['onDownloadProgress'],
    config?: RequestConfig
  ): Promise<void> {
    let downloadUrl: string | null = null;

    try {
      const response = await this.instance.get<BlobPart, BlobPart>(url, {
        ...config,
        responseType: 'blob',
        onDownloadProgress,
        signal: this.abortController.signal,
      });

      const blob = new Blob([response]);

      if (blob.size === 0) {
        throw new Error('Download failed: Empty file');
      }

      downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      if (downloadUrl) {
        window.URL.revokeObjectURL(downloadUrl);
      }
    }
  }

  public cancelRequest(message?: string): void {
    this.abortController.abort(message);
    this.abortController = new AbortController();
  }

  public setHeader(key: string, value: string): void {
    this.instance.defaults.headers.common[key] = value;
  }

  public setTimeout(timeout: number): void {
    this.instance.defaults.timeout = timeout;
  }
}

const createHttpRequest = (baseURL: string, config?: AxiosRequestConfig) => {
  return new HttpRequest(baseURL, config);
};

export default createHttpRequest;
