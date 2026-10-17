declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV?: string;
    PORT?: string;
    CLIENT_URL?: string;
    MONGO_URI?: string;
    MONGO_DNS_SERVERS?: string;
  }
}
