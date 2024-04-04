import {type IdPair} from '../../types'
import {emitOperation} from '../operationEvents'
import {publish} from '../operations/publish'
import {commit} from './commit'
import {del} from './delete'
import {discardChanges} from './discardChanges'
import {duplicate} from './duplicate'
import {patch} from './patch'
import {restore} from './restore'
import {type Operation, type OperationArgs, type OperationImpl, type OperationsAPI} from './types'
import {unpublish} from './unpublish'

function createOperationGuard(opName: string): Operation<any[], 'NOT_READY'> {
  return {
    disabled: 'NOT_READY',
    execute: () => {
      throw new Error(`Called ${opName} before it was ready.`)
    },
  }
}

// This creates a version of the operations api that will throw if called.
// Most operations depend on having the "current document state" available locally and if an action gets called
// before we have the state available, we throw an error to signal "premature" invocation before ready
export const GUARDED: OperationsAPI = {
  commit: createOperationGuard('commit'),
  delete: createOperationGuard('delete'),
  del: createOperationGuard('del'),
  publish: createOperationGuard('publish'),
  patch: createOperationGuard('patch'),
  discardChanges: createOperationGuard('discardChanges'),
  unpublish: createOperationGuard('unpublish'),
  duplicate: createOperationGuard('duplicate'),
  restore: createOperationGuard('restore'),
}
const createEmitter =
  (operationName: keyof OperationsAPI, idPair: IdPair, typeName: string) =>
  (...executeArgs: any[]) =>
    emitOperation(operationName, idPair, typeName, executeArgs)

function wrap<ExtraArgs extends any[], DisabledReason extends string>(
  opName: keyof OperationsAPI,
  op: OperationImpl<ExtraArgs, DisabledReason>,
  operationArgs: OperationArgs,
): Operation<ExtraArgs, DisabledReason> {
  const disabled = op.disabled(operationArgs)
  return {
    disabled,
    execute: createEmitter(opName, operationArgs.idPair, operationArgs.typeName),
  }
}

export function createOperationsAPI(args: OperationArgs): OperationsAPI {
  const operationsAPI = {
    commit: wrap('commit', commit, args),
    delete: wrap('delete', del, args),
    del: wrap('delete', del, args),
    publish: wrap('publish', publish, args),
    patch: wrap('patch', patch, args),
    discardChanges: wrap('discardChanges', discardChanges, args),
    unpublish: wrap('unpublish', unpublish, args),
    duplicate: wrap('duplicate', duplicate, args),
    restore: wrap('restore', restore, args),
  }

  //as we add server operations one by one, we can add them here
  if (args.serverActionsEnabled) {
    return {
      ...operationsAPI,
    }
  }
  return operationsAPI
}
