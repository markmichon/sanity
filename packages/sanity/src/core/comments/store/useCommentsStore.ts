import {type ListenEvent, type ListenOptions, type SanityClient} from '@sanity/client'
import {useCallback, useEffect, useMemo, useReducer, useRef, useState} from 'react'
import {catchError, of} from 'rxjs'

import {getPublishedId, isVersionId} from '../../util'
import {type CommentDocument, type Loadable} from '../types'
import {commentsReducer, type CommentsReducerAction, type CommentsReducerState} from './reducer'

type DocumentId = string
type TransactionId = string

export interface CommentsStoreOptions {
  client: SanityClient | null
  documentId: string
  onLatestTransactionIdReceived: (documentId: DocumentId) => void
  transactionsIdMap: Map<DocumentId, TransactionId>
}

interface CommentsStoreReturnType extends Loadable<CommentDocument[]> {
  dispatch: React.Dispatch<CommentsReducerAction>
}

const INITIAL_STATE: CommentsReducerState = {
  comments: {},
}

const LISTEN_OPTIONS: ListenOptions = {
  events: ['welcome', 'mutation', 'reconnect'],
  includeResult: true,
  visibility: 'query',
}

export const SORT_FIELD = '_createdAt'
export const SORT_ORDER = 'desc'

const QUERY_FILTERS = [`_type == "comment"`, `target.document._ref == $documentId`]

const QUERY_PROJECTION = `{
  _createdAt,
  _id,
  authorId,
  contentSnapshot,
  context,
  lastEditedAt,
  message,
  parentCommentId,
  reactions,
  status,
  target,
  threadId
}`

// Newest comments first
const QUERY_SORT_ORDER = `order(${SORT_FIELD} ${SORT_ORDER})`

const QUERY = `*[${QUERY_FILTERS.join(' && ')}] ${QUERY_PROJECTION} | ${QUERY_SORT_ORDER}`

export function useCommentsStore(opts: CommentsStoreOptions): CommentsStoreReturnType {
  const {client, documentId, onLatestTransactionIdReceived, transactionsIdMap} = opts

  const [state, dispatch] = useReducer(commentsReducer, INITIAL_STATE)
  const [loading, setLoading] = useState<boolean>(client !== null)
  const [error, setError] = useState<Error | null>(null)

  const didInitialFetch = useRef<boolean>(false)

  const params = useMemo(
    () => ({documentId: isVersionId(documentId) ? documentId : getPublishedId(documentId)}),
    [documentId],
  )

  const initialFetch = useCallback(async () => {
    if (!client) {
      setLoading(false)
      return
    }

    try {
      const res = await client.fetch(QUERY, params)
      dispatch({type: 'COMMENTS_SET', comments: res})
      setLoading(false)
    } catch (err) {
      setError(err)
    }
  }, [client, params])

  const handleListenerEvent = useCallback(
    async (event: ListenEvent<Record<string, CommentDocument>>) => {
      // Fetch all comments on initial connection
      if (event.type === 'welcome' && !didInitialFetch.current) {
        setLoading(true)
        await initialFetch()
        setLoading(false)
        didInitialFetch.current = true
      }

      // The reconnect event means that we are trying to reconnect to the realtime listener.
      // In this case we set loading to true to indicate that we're trying to
      // reconnect. Once a connection has been established, the welcome event
      // will be received and we'll fetch all comments again (above)
      if (event.type === 'reconnect') {
        setLoading(true)
        didInitialFetch.current = false
      }

      // Handle mutations (create, update, delete) from the realtime listener
      // and update the comments store accordingly
      if (event.type === 'mutation') {
        if (event.transition === 'appear') {
          const nextComment = event.result as CommentDocument | undefined

          if (nextComment) {
            dispatch({
              type: 'COMMENT_RECEIVED',
              payload: nextComment,
            })
          }
        }

        if (event.transition === 'disappear') {
          dispatch({type: 'COMMENT_DELETED', id: event.documentId})
        }

        if (event.transition === 'update') {
          const updatedComment = event.result as CommentDocument | undefined

          const id = event.result?._id || ''
          const transactionId = event.transactionId
          const latestTransactionId = transactionsIdMap.get(id)
          const isLatestTransaction = transactionId === latestTransactionId

          // If we have a transaction id stored for the received comment id, but the
          // received transaction id is not the latest, we don't want to update the
          // comment in the store. This is to avoid that the UI is updated with an old
          // transaction id when multiple transactions are started in a short time span.
          if (!isLatestTransaction && latestTransactionId) return

          if (updatedComment) {
            dispatch({
              type: 'COMMENT_UPDATED',
              payload: updatedComment,
            })

            // If the received transaction id is the latest, we'll call the
            // `onLatestTransactionIdReceived` callback to let the parent consumer
            // know that the transaction id has been received.
            if (isLatestTransaction) {
              onLatestTransactionIdReceived(id)
            }
          }
        }
      }
    },
    [initialFetch, onLatestTransactionIdReceived, transactionsIdMap],
  )

  const listener$ = useMemo(() => {
    if (!client) return of()

    const events$ = client.observable.listen(QUERY, params, LISTEN_OPTIONS).pipe(
      catchError((err) => {
        setError(err)
        return of(err)
      }),
    )

    return events$
  }, [client, params])

  useEffect(() => {
    const sub = listener$.subscribe(handleListenerEvent)

    return () => {
      sub?.unsubscribe()
    }
  }, [handleListenerEvent, listener$])

  // Transform comments object to array
  const commentsAsArray = useMemo(() => Object.values(state.comments), [state.comments])

  return {
    data: commentsAsArray,
    dispatch,
    error,
    loading,
  }
}
