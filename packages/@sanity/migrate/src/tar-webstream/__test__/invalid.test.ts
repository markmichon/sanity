import {streamAsyncIterator} from '../../utils/streamToAsyncIterator'
import {untar} from '../untar'
import {readFileAsWebStream} from '../../fs-webstream/readFileAsWebStream'

async function* extract(file: string) {
  const fileStream = readFileAsWebStream(file)
  for await (const [header, body] of streamAsyncIterator(untar(fileStream))) {
    yield [header.name, streamAsyncIterator(body)]
  }
}

test('untar an empty tar file', () => {
  expect(async () => {
    for await (const [, body] of extract(`${__dirname}/fixtures/empty.tar`)) {
      for await (const chunk of body) {
        // should throw before reaching here
      }
    }
  }).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Unexpected end of tar file. Expected 512 bytes of headers.]`,
  )
})

test('untar an invalid tar file of > 512b', () => {
  expect(async () => {
    for await (const [, body] of extract(`${__dirname}/fixtures/invalid.tar`)) {
      for await (const chunk of body) {
        // should throw before reaching here
      }
    }
  }).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Invalid tar header. Maybe the tar is corrupted or it needs to be gunzipped?]`,
  )
})

test('untar a corrupted tar file', () => {
  expect(async () => {
    for await (const [, body] of extract(`${__dirname}/fixtures/corrupted.tar`)) {
      for await (const chunk of body) {
        // should throw before reaching here
      }
    }
  }).rejects.toThrowErrorMatchingInlineSnapshot(
    `[Error: Invalid tar header. Maybe the tar is corrupted or it needs to be gunzipped?]`,
  )
})
