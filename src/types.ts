export type PlanType = 'basic' | 'premium';
export type ProviderStatus = 'active' | 'blocked';
export type ClientStatus = 'active' | 'blocked' | 'overdue';
export type TicketStatus = 'open' | 'closed';
export type BillingStatus = 'pending' | 'paid' | 'overdue';

export interface Provider {
  id: string;
  name: string;
  subdomain: string;
  settings: {
    logoUrl?: string;
    primaryColor: string;
    theme: 'light' | 'dark';
    whatsapp: string;
    email: string;
  };
  planType: PlanType;
  status: ProviderStatus;
  ownerId: string;
}

export interface Client {
  id: string;
  providerId: string;
  name: string;
  cpfCnpj: string;
  address: string;
  whatsapp: string;
  planId: string;
  status: ClientStatus;
  uid?: string;
}

export interface Equipment {
  id: string;
  clientId: string;
  providerId: string;
  type: 'router' | 'onu';
  model: string;
  mac: string;
  serial: string;
  ip: string;
}

export interface Billing {
  id: string;
  clientId: string;
  providerId: string;
  amount: number;
  dueDate: any; // Firestore Timestamp
  status: BillingStatus;
  pixKey?: string;
}

export interface Ticket {
  id: string;
  clientId: string;
  providerId: string;
  subject: string;
  status: TicketStatus;
  lastMessageAt: any;
}

export interface Message {
  id: string;
  ticketId: string;
  senderId: string;
  text: string;
  imageUrl?: string;
  createdAt: any;
}
