import crypto from 'crypto';

export interface BinanceCredentials {
  apiKey: string;
  apiSecret: string;
  testnet?: boolean;
}

export class BinanceExecutionClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;

  constructor(creds?: BinanceCredentials) {
    this.apiKey = creds?.apiKey || process.env.BINANCE_API_KEY || '';
    this.apiSecret = creds?.apiSecret || process.env.BINANCE_API_SECRET || '';
    const isTestnet = creds?.testnet ?? (process.env.BINANCE_TESTNET === 'true');
    this.baseUrl = isTestnet
      ? 'https://testnet.binance.vision/api'
      : 'https://api.binance.com/api';
  }

  public isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiSecret);
  }

  public updateCredentials(creds: BinanceCredentials): void {
    if (creds.apiKey) this.apiKey = creds.apiKey.trim();
    if (creds.apiSecret) this.apiSecret = creds.apiSecret.trim();
    if (typeof creds.testnet === 'boolean') {
      this.baseUrl = creds.testnet
        ? 'https://testnet.binance.vision/api'
        : 'https://api.binance.com/api';
    }
  }

  /**
   * Generates HMAC-SHA256 signature strictly locally
   */
  private signQuery(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  /**
   * Executes authentic order placement via signed REST request
   */
  public async sendOrder(params: {
    symbol: string;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT';
    quantity: number;
    price?: number;
  }): Promise<{ success: boolean; data?: any; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'BINANCE_CREDENTIALS_MISSING: Provide BINANCE_API_KEY and BINANCE_API_SECRET in .env or broker settings',
      };
    }

    try {
      const timestamp = Date.now();
      const queryParts = [
        `symbol=${params.symbol.toUpperCase()}`,
        `side=${params.side}`,
        `type=${params.type}`,
        `quantity=${params.quantity.toFixed(5)}`,
        `timestamp=${timestamp}`,
        `recvWindow=5000`,
      ];

      if (params.type === 'LIMIT' && params.price) {
        queryParts.push(`price=${params.price.toFixed(2)}`);
        queryParts.push(`timeInForce=GTC`);
      }

      const queryString = queryParts.join('&');
      const signature = this.signQuery(queryString);
      const url = `${this.baseUrl}/v3/order?${queryString}&signature=${signature}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'X-MBX-APIKEY': this.apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const json = await res.json();
      if (!res.ok) {
        return {
          success: false,
          error: json.msg || `Binance API error: ${res.status}`,
        };
      }

      return {
        success: true,
        data: json,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Network request failure',
      };
    }
  }

  /**
   * Verifies local API connectivity and checks account balance
   */
  public async getAccountInfo(): Promise<{ success: boolean; balances?: any[]; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'BINANCE_CREDENTIALS_MISSING' };
    }

    try {
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}&recvWindow=5000`;
      const signature = this.signQuery(queryString);
      const url = `${this.baseUrl}/v3/account?${queryString}&signature=${signature}`;

      const res = await fetch(url, {
        headers: {
          'X-MBX-APIKEY': this.apiKey,
        },
      });

      const json = await res.json();
      if (!res.ok) {
        return { success: false, error: json.msg || 'Failed to fetch account info' };
      }

      return { success: true, balances: json.balances };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
