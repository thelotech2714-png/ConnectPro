import { FirebaseError } from 'firebase/app';

export function getFriendlyErrorMessage(error: any): string {
  console.error('Error caught:', error);
  
  const code = error.code || (error.message?.includes('auth/') ? error.message.match(/auth\/[a-z0-9-]+/)?.[0] : null);
  const message = error.message || String(error);

  console.error('Friendly mapping for code:', code);

  // Auth Errors
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Erro: Ative os provedores de autenticação (Email/Senha e Anônimo) no Console do Firebase (Menu Build -> Authentication).';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Este e-mail já está em uso por outra conta.';
  }
  if (code === 'auth/weak-password') {
    return 'A senha é muito fraca. Use pelo menos 6 caracteres.';
  }
  if (code === 'auth/invalid-credential' || code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'E-mail ou senha incorretos. Verifique suas credenciais.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Muitas tentativas malsucedidas. Tente novamente mais tarde.';
  }
  if (code === 'auth/invalid-email') {
    return 'O formato do e-mail é inválido.';
  }
  if (code === 'auth/user-disabled') {
    return 'Esta conta de usuário foi desativada.';
  }

  // Firestore Errors
  if (message.toLowerCase().includes('offline') || 
      code === 'unavailable' || 
      code === 'failed-precondition' || 
      message.toLowerCase().includes('failed to get document') ||
      message.toLowerCase().includes('network') ||
      message.toLowerCase().includes('backend unreachable')) {
    return 'SINCRONIZAÇÃO PENDENTE: O sistema está tentando restabelecer conexão com o Cloud. ' +
           'Isso pode ocorrer por oscilação na internet ou bloqueio de firewall local. ' +
           'Clique no botão "Sincronizar Cloud Agora" para forçar a reconexão.';
  }
  if (code === 'deadline-exceeded') {
    return 'TEMPO EXCEDIDO (Cloud): A infraestrutura demorou muito para responder. Isso pode ocorrer em consultas pesadas ou sinal Wi-Fi instável.';
  }
  if (message.includes('permission-denied') || code === 'permission-denied') {
    return 'Acesso Negado: Você não tem permissão para realizar esta ação.';
  }
  if (message.includes('not-found') || code === 'not-found') {
    return 'O recurso solicitado não foi encontrado no banco de dados.';
  }

  return message || 'Ocorreu um erro inesperado. Tente novamente.';
}
