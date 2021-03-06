/** Copyright (c) 2018 Uber Technologies, Inc.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {createPlugin, createToken} from 'fusion-core';
import {FetchToken} from 'fusion-tokens';
import {GraphQLSchemaToken, ApolloContextToken} from 'fusion-apollo';
import {ApolloClient} from 'apollo-client';
import {HttpLink} from 'apollo-link-http';
import {WebSocketLink} from 'apollo-link-ws';
import {SubscriptionClient} from 'subscriptions-transport-ws';
import {ApolloLink, concat} from 'apollo-link';
import {SchemaLink} from 'apollo-link-schema';

import type {Token} from 'fusion-core';

// Fixed By: https://github.com/benmosher/eslint-plugin-import/issues/975#issuecomment-348807796
// eslint-disable-next-line
import {InMemoryCache} from 'apollo-cache-inmemory';

import * as Cookies from 'js-cookie';

export const ApolloClientEndpointToken: Token<string> = createToken(
  'ApolloClientEndpointToken'
);

export const ApolloClientSubscriptionEndpointToken: Token<string> = createToken(
  'ApolloClientSubscriptionEndpointToken'
);

export const ApolloClientCredentialsToken: Token<string> = createToken(
  'ApolloClientCredentialsToken'
);
export const ApolloClientAuthKeyToken = createToken('ApolloClientAuthKeyToken');


const ApolloClientPlugin = createPlugin({
  deps: {
    endpoint: ApolloClientEndpointToken,
    subscriptionEndpoint: ApolloClientSubscriptionEndpointToken,
    fetch: FetchToken,
    includeCredentials: ApolloClientCredentialsToken.optional,
    authKey: ApolloClientAuthKeyToken.optional,
    schema: GraphQLSchemaToken.optional,
    apolloContext: ApolloContextToken.optional,
  },
  provides({
    endpoint,
    subscriptionEndpoint,
    fetch,
    authKey = 'token',
    includeCredentials = 'same-origin',
    apolloContext,
    schema,
  }) {
    return (ctx, initialState) => {
      const getBrowserProps = () => {
        return Cookies.get(authKey);
      };

      const getServerProps = () => {
        return ctx && ctx.cookies.get(authKey);
      };

      let connectionLink =
        schema && __NODE__
          ? new SchemaLink({
              schema,
              context:
                typeof apolloContext === 'function'
                  ? apolloContext(ctx)
                  : apolloContext,
            })
          : new HttpLink({
              uri: endpoint,
              credentials: includeCredentials,
              fetch,
            });
                        
      const token = __BROWSER__ ? getBrowserProps() : getServerProps();
      const authMiddleware = new ApolloLink((operation, forward) => {
        if (token) {
          operation.setContext({
            headers: {
              authorization: `Bearer ${token}`,
            },
          });
        }

        return forward(operation);
      });

      if (__BROWSER__) {        
        const subscriptionClient = new SubscriptionClient(subscriptionEndpoint, {
          reconnect: true,
          connectionParams: () => ({
            authorization: `Bearer ${token}`,
          })
        });
        const wsLink = new WebSocketLink(subscriptionClient);

        const hasSubscriptionOperation = ({ query: { definitions } }) =>
          definitions.some(
            ({ kind, operation }) =>
              kind === 'OperationDefinition' && operation === 'subscription',
          )
        
        connectionLink = ApolloLink.split(
          hasSubscriptionOperation,
          wsLink,
          connectionLink,
        )
      }

      const client = new ApolloClient({
        ssrMode: true,
        link: concat(authMiddleware, connectionLink),
        cache: new InMemoryCache().restore(initialState),
      });
      return client;
    };
  },
});
export default ApolloClientPlugin;
