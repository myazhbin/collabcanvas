export type DemoAccount = {
  name: string
  email: string
  password: string
}

export const DEMO_PASSWORD = 'demo1234'

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { name: 'Ada', email: 'ada@demo.invalid', password: DEMO_PASSWORD },
  { name: 'Grace', email: 'grace@demo.invalid', password: DEMO_PASSWORD },
  { name: 'Alan', email: 'alan@demo.invalid', password: DEMO_PASSWORD },
]
