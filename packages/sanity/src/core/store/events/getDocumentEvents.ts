import {
  type MendozaEffectPair,
  type MendozaPatch,
  type TransactionLogEventWithEffects,
} from '@sanity/types'

import {getDraftId, getPublishedId, getVersionFromId} from '../../util/draftUtils'
import {type Transaction} from '../_legacy/history/history/types'
import {type DocumentGroupEvent} from './types'

type EffectState = 'unedited' | 'deleted' | 'upsert' | 'created'

// Similar to https://github.com/sanity-io/sanity/blob/events-api-studio/packages/sanity/src/core/store/_legacy/history/history/chunker.ts#L67
function getEffectState(effect?: MendozaEffectPair): EffectState {
  const modified = Boolean(effect)
  const deleted = effect && isDeletePatch(effect?.apply)
  //  New concept. How to read the "creation" if not like this?
  const created = effect && isDeletePatch(effect?.revert)

  if (deleted) {
    return 'deleted'
  }
  if (created) {
    return 'created'
  }

  if (modified) {
    return 'upsert'
  }

  return 'unedited'
}

/**
 * The document we should look at in the transaction
 */
type DocumentToMapTheAction = 'draft' | 'published' | 'none'

type DocumentEventType = DocumentGroupEvent['type'] | 'no-effect' | 'maybeUnpublishMaybeDelete'

/**
 *  | **Publish is**            | **Draft is created**                | **Draft is deleted**                  | **Draft is unedited**                 | **Draft is upsert**                 |
 *  |---------------------------|-------------------------------------|---------------------------------------|---------------------------------------|-------------------------------------|
 *  | **unedited**              | document.createVersion (draft)      | document.deleteVersion (draft)        | no-effect (none)                      | document.editVersion (draft)        |
 *  | **deleted**               | document.unpublish (published)      | document.deleteGroup (published)      | maybeUnpublishMaybeDelete (published) | document.unpublish (published)      |
 *  | **upsert**                | document.updateLive (published)     | document.publishVersion (published)   | document.updateLive (published)       | document.updateLive (published)     |
 *  | **created**               | document.createVersion (published)  | document.publishVersion (published)   | document.createLive (published)       | document.createVersion (published)  |
 */

const STATE_MAP: {
  [publishState in EffectState]: {
    [draftState in EffectState]: {
      type: DocumentEventType
      document: DocumentToMapTheAction
    }
  }
} = {
  // Publish is:
  unedited: {
    // & Draft is:
    created: {type: 'document.createVersion', document: 'draft'},
    deleted: {type: 'document.deleteVersion', document: 'draft'},
    upsert: {type: 'document.editVersion', document: 'draft'},
    unedited: {type: 'no-effect', document: 'none'},
  },
  // Publish is:
  deleted: {
    // & Draft is:
    created: {type: 'document.unpublish', document: 'published'},
    deleted: {type: 'document.deleteGroup', document: 'published'},
    unedited: {type: 'maybeUnpublishMaybeDelete', document: 'published'},
    upsert: {type: 'document.unpublish', document: 'published'},
  },
  // Publish is:
  upsert: {
    // &  Draft is:
    created: {type: 'document.updateLive', document: 'published'},
    deleted: {type: 'document.publishVersion', document: 'published'},
    unedited: {type: 'document.updateLive', document: 'published'},
    upsert: {type: 'document.updateLive', document: 'published'},
  },
  // Publish is:
  created: {
    // & Draft is:
    created: {type: 'document.createVersion', document: 'published'}, // Should be document: both??
    deleted: {type: 'document.publishVersion', document: 'published'},
    unedited: {type: 'document.createLive', document: 'published'},
    upsert: {type: 'document.createVersion', document: 'published'},
  },
}

function isDeletePatch(patch: MendozaPatch): boolean {
  return patch[0] === 0 && patch[1] === null
}

/**
 * @internal
 * @beta
 * This might change, don't use.
 * This function receives a transaction and returns a document group event.
 * Assumes the user is viewing the published document with only drafts. Versions are not yet supported here
 */
export function getEventFromTransaction(
  documentId: string,
  transaction: Transaction,
  previousTransactions: Transaction[],
): DocumentGroupEvent {
  const base = {
    id: transaction.id,
    timestamp: transaction.timestamp,
    author: transaction.author,
  }

  const draftId = getDraftId(documentId)
  const publishedId = getPublishedId(documentId)
  const draftState = getEffectState(transaction.draftEffect)
  const publishedState = getEffectState(transaction.publishedEffect)
  const getDocumentEvent = (
    type: DocumentEventType,
    document: DocumentToMapTheAction,
  ): DocumentGroupEvent => {
    switch (type) {
      case 'document.createVersion': {
        if (document === 'draft') {
          const lastDraftTransaction = previousTransactions.find((t) => t.draftEffect)
          const wasDraftDeleted =
            lastDraftTransaction?.draftEffect && // Modified the draft
            isDeletePatch(lastDraftTransaction.draftEffect?.apply) && // Deleted the draft
            !lastDraftTransaction.publishedEffect // No changes to publish doc, so it was not a publish action.

          const draftExisted = previousTransactions.some((t) => Boolean(t.draftEffect))

          if (draftExisted && !wasDraftDeleted) {
            return getDocumentEvent('document.editVersion', document)
          }
        }
        return {
          ...base,
          type,

          documentId: documentId,
          versionId: document === 'draft' ? draftId : publishedId,
          releaseId: getVersionFromId(documentId),
          versionRevisionId: transaction.id,
        }
      }
      case 'document.editVersion': {
        return {
          ...base,
          type,

          releaseId: getVersionFromId(documentId),
          versionId: draftId,
          versionRevisionId: transaction.id,
        }
      }

      case 'document.deleteVersion': {
        return {
          ...base,
          type,

          versionId: document === 'draft' ? draftId : publishedId,
          // The revision id of the last edit in the draft document
          versionRevisionId:
            previousTransactions.find((t) => Boolean(t.draftEffect))?.id || 'not-found',
          releaseId: getVersionFromId(documentId),
        }
      }

      case 'document.publishVersion': {
        return {
          ...base,
          type,

          revisionId: transaction.id,
          releaseId: getVersionFromId(documentId),
          versionId: draftId, // TODO: How to get the version in case of releases
          versionRevisionId:
            previousTransactions.find((t) => Boolean(t.draftEffect))?.id || 'not-found',
          cause: {
            type: 'document.publish', // TODO: How to get the `release.publish` and the `release.schedule` events?
          },
        }
      }

      case 'document.unpublish': {
        return {
          ...base,
          type,

          // The version that will be created by this unpublish action, e.g. drafts.foo
          versionId: transaction.draftEffect ? draftId : undefined,
          versionRevisionId: transaction.draftEffect ? transaction.id : undefined,
          releaseId: getVersionFromId(documentId),
        }
      }
      case 'document.createLive': {
        return {
          ...base,
          type,
          documentId: publishedId,
          revisionId: transaction.id,
        }
      }
      case 'document.updateLive': {
        return {
          ...base,
          type,
          documentId: publishedId,
          revisionId: transaction.id,
        }
      }

      case 'document.deleteGroup': {
        return {
          ...base,
          type,
        }
      }
      case 'maybeUnpublishMaybeDelete': {
        // In this tx, published is deleted and draft unedited.
        // We need to determine if draft at this point exists or not.
        const lastDraftTransaction = previousTransactions.find((t) => t.draftEffect)
        if (!lastDraftTransaction) {
          // Draft doesn't exist and it was not created, so it was a delete action
          return getDocumentEvent('document.deleteGroup', document)
        }
        const wasDraftDeletedOrPublished =
          lastDraftTransaction.draftEffect && // Modified the draft
          isDeletePatch(lastDraftTransaction.draftEffect?.apply)

        if (wasDraftDeletedOrPublished) {
          // Draft was either deleted or published, so it doesn't exist, no draft was created, so it's a delete action.
          return getDocumentEvent('document.deleteGroup', document)
        }
        return getDocumentEvent('document.unpublish', document)
      }

      // The following are not implemented yet - We don't yet have the concept of scheduling versions.
      case 'document.scheduleVersion': {
        return {
          ...base,
          type,
          // @ts-expect-error this is not implemented yet
          'not-implemented': true,
        }
      }
      case 'document.unscheduleVersion': {
        return {
          ...base,
          type,
          // @ts-expect-error this is not implemented yet
          'not-implemented': true,
        }
      }

      default: {
        console.error(`Unhandled event type: ${type}`)
        return {
          ...base,
          type: 'document.editVersion',
          releaseId: getVersionFromId(documentId),
          versionId: draftId,
          versionRevisionId: transaction.id,
        }
      }
    }
  }

  const {type, document} = STATE_MAP[publishedState][draftState]

  return getDocumentEvent(type, document)
}

const MERGE_WINDOW = 5 * 60 * 1000 // 5 minutes

function isWithinMergeWindow(a: string, b: string) {
  return Math.abs(Date.parse(a) - Date.parse(b)) < MERGE_WINDOW
}

const mergeEvents = (events: DocumentGroupEvent[]): DocumentGroupEvent[] => {
  const result = []

  for (const event of events) {
    if (result.length === 0) {
      // If result is empty, add the current event
      result.push(event)
    } else {
      const lastEvent = result[result.length - 1]

      if (
        lastEvent.type === 'document.editVersion' &&
        event.type === 'document.editVersion' &&
        isWithinMergeWindow(lastEvent.timestamp, event.timestamp)
      ) {
        // Merge the current event into the last event's merged array
        if (!lastEvent.mergedEvents) {
          lastEvent.mergedEvents = []
        }
        lastEvent.mergedEvents.push(event)
      } else {
        // If the time difference is greater than the window, add as a new event
        result.push(event)
      }
    }
  }

  return result
}

/**
 * @internal
 * @beta
 */
export const addTransactionEffect = (
  documentId: string,
  transaction: TransactionLogEventWithEffects,
  index: number,
): Transaction => {
  const draftEffect = transaction.effects[getDraftId(documentId)]
  const publishedEffect = transaction.effects[getPublishedId(documentId)]
  return {
    index,
    id: transaction.id,
    timestamp: transaction.timestamp,
    author: transaction.author,
    draftEffect,
    publishedEffect,
  }
}

/**
 * @internal
 * @beta
 *
 * This function receives a list of transactions that can be fetched from CL transactions API {@link https://www.sanity.io/docs/history-api#45ac5eece4ca}
 * It is intended at least now, to support fetching the transactions for the published and draft document and builds the
 * document group events from the response.
 */
export function getDocumentEvents(
  documentId: string,
  transactions: TransactionLogEventWithEffects[],
): DocumentGroupEvent[] {
  const events = transactions.map((transaction, index) => {
    // The transactions are ordered from newest to oldest, so we can slice the array from the current index
    const previousTransactions = transactions.slice(index + 1)

    return getEventFromTransaction(
      documentId,
      addTransactionEffect(documentId, transaction, index),
      previousTransactions.map((tx, i) => addTransactionEffect(documentId, tx, i)),
    )
  })

  return mergeEvents(events)
}
