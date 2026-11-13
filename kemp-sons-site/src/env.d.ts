interface ImportMetaEnv {
  readonly PUBLIC_SHOP_URL?: string
  readonly SHOPIFY_STORE_DOMAIN?: string
  readonly SHOPIFY_STOREFRONT_TOKEN?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
